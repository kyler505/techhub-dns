#!/usr/bin/env python3
import requests
import json
import tkinter as tk
from tkinter import ttk, simpledialog, messagebox
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
import sys
import webbrowser
import threading
import win32api
import win32print
import os
import tempfile
import shutil
from pydrive.auth import GoogleAuth
from pydrive.drive import GoogleDrive
from multiprocessing import Process, Lock
import time
import copy
import re
from typing import List

# ────────────────────────────────────────────────────────────────
# Azure Key Vault imports & configuration
# ────────────────────────────────────────────────────────────────
from azure.identity import InteractiveBrowserCredential
from azure.keyvault.secrets import SecretClient

KEY_VAULT_URL    = "https://techhubvault.vault.azure.net/"
INFLOW_SECRET    = "inflow-API-key-new"   # the name of your InFlow API key secret

# authenticate via browser and fetch secret
credential    = InteractiveBrowserCredential(additionally_allowed_tenants=["*"])
kv_client     = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)
inflow_key    = kv_client.get_secret(INFLOW_SECRET)
api_key       = inflow_key.value

# ────────────────────────────────────────────────────────────────
# Configuration for API access
# ────────────────────────────────────────────────────────────────
company_id = '6eb6abe4-d92a-4130-a15e-64d3b7278b81'
base_url   = 'https://cloudapi.inflowinventory.com'
headers    = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type':  'application/json',
    'Accept':        'application/json;version=2024-03-12'
}

computer_imaging_id = "08551719-578a-4956-ba56-18d5913aaf8a"

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

system_ids = ["e9efa219-a9b7-49b2-a61a-1820760f9dea", 
              "df81fb27-ad68-4311-b01d-ef5214cf1aa2", 
              "d0998e9d-6d70-47d7-9101-cd79036fb809", 
              "734ac0f4-bc67-4ca6-ae42-533411f1d811", 
              "3a4accf6-aadc-4d94-96c6-e0ba1f238693",
            "1c17cb19-777e-4337-976a-e553d0e76ddf", 
            "c050effa-86db-4497-80e0-e8546d862b0d", 
              "415054a7-1b0f-40cf-b9d0-4015073452a8"]

# Speed knobs for fetching:
PER_PAGE        = 100      # API max=100
MAX_PAGES       = 3        # Pull last 3 pages
TARGET_MATCHES  = 30       # Max orders to process

# ── Order number normalization ──────────────────────────────────
def normalize_to_th(tokens: List[str]) -> List[str]:
    """Normalize order numbers to TH#### format"""
    out, seen = [], set()
    for tok in tokens or []:
        t = str(tok).strip().upper()
        if t.startswith("TH"):
            t = t[2:]
        digits = "".join(ch for ch in t if ch.isdigit())
        if not digits:
            continue
        canon = f"TH{digits}"
        if canon not in seen:
            seen.add(canon)
            out.append(canon)
    return out

# ── Manual order prompt ─────────────────────────────────────────
def prompt_manual_orders() -> List[str]:
    """
    Ask: run manual orders? If yes, prompt for comma/space separated values.
    Returns normalized TH#### list or empty list if user said No or entered nothing valid.
    """
    root = tk.Tk()
    root.withdraw()
    try:
        if not messagebox.askyesno("Manual Orders", "Do you have any order numbers to run manually?"):
            return []
        s = simpledialog.askstring(
            "Manual Orders",
            "Enter order numbers separated by commas or spaces (e.g., 3270, 3331 3399).",
            parent=root,
        )
        if not s:
            messagebox.showinfo("Manual Orders", "No input provided; continuing with recent orders.")
            return []
        tokens = [t for t in re.split(r"[,\s]+", s.strip()) if t]
        return normalize_to_th(tokens)
    finally:
        try:
            root.destroy()
        except Exception:
            pass

# ── Helper functions ────────────────────────────────────────────
def _items(resp_json):
    return resp_json.get("items", []) if isinstance(resp_json, dict) else resp_json

def is_strict_started(order: dict) -> bool:
    """STRICT check: only accept orders whose top-level inventoryStatus is 'started' (case-insensitive)."""
    return str(order.get("inventoryStatus", "")).strip().lower() == "started"

# ── Fetch specific order by number ──────────────────────────────
def fetch_order_by_number(order_number: str):
    """Fetch a specific order by its order number"""
    url = f'{base_url}/{company_id}/sales-orders'
    params = {
        'include': 'pickLines.product,shipLines,packLines.product,lines',
        'filter[isActive]': 'true',
        'filter[orderNumber]': order_number,
        'count': '1',
        'skip': '0'
    }
    
    response = requests.get(url, params=params, headers=headers)
    print(f"Fetching order {order_number}...")
    
    if response.status_code != 200:
        print(f"  Error fetching {order_number}:", response.status_code)
        return None
    
    rows = _items(response.json()) or []
    if rows:
        return rows[0]
    return None

# ── Process manual orders ───────────────────────────────────────
def process_manual_orders(order_numbers: List[str]):
    """Process manually entered order numbers"""
    print(f"\nManual mode: processing {len(order_numbers)} order(s): {', '.join(order_numbers)}")
    
    all_orders = []
    for onum in order_numbers:
        order = fetch_order_by_number(onum)
        if not order:
            print(f"  Order {onum} not found")
            continue
        
        # Check if it's started
        if not is_strict_started(order):
            print(f"  Order {onum} found but status is '{order.get('inventoryStatus', '')}' (not 'started')")
            continue
            
        all_orders.append(order)
        print(f"  Order {onum} found and is 'started'")
    
    if not all_orders:
        print("\nNo valid 'started' orders found in manual mode.")
        return None
    
    return all_orders

# ── FAST fetch: most-recent UNFULFILLED, keep ONLY "started" ────
def fetch_recent_started_orders():
    """Fetch recent orders, filtering for 'started' status"""
    url = f'{base_url}/{company_id}/sales-orders'
    matches = []
    
    for page in range(MAX_PAGES):
        params = {
            'include': 'pickLines.product,shipLines,packLines.product,lines',
            'filter[isActive]': 'true',
            'filter[inventoryStatus][]': 'unfulfilled',
            'count': str(PER_PAGE),
            'skip': str(page * PER_PAGE),
            'sort': 'orderDate',
            'sortDesc': 'true'  # newest first
        }
        
        response = requests.get(url, params=params, headers=headers)
        print(f"Fetching page {page + 1} of recent orders...")
        
        if response.status_code != 200:
            print(f"Error fetching page {page + 1}:", response.status_code)
            break
        
        rows = _items(response.json()) or []
        for order in rows:
            if is_strict_started(order):
                matches.append(order)
                if len(matches) >= TARGET_MATCHES:
                    return matches
        
        if len(rows) < PER_PAGE:
            break  # no more pages
    
    return matches



def wrap_text(text, max_width, font_name, font_size):
    words = text.split()
    lines = []
    line = ""
    
    for word in words:
        test_line = f"{line} {word}".strip()
        test_width = stringWidth(test_line, font_name, font_size)
        if test_width <= max_width:
            line = test_line
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines

def imagingChecker(lines: dict) -> bool:
    isImaged = False

    for line in lines:
        if computer_imaging_id == line['productId']:
            isImaged = True

    return isImaged

def driveUpload():
    # Initialize GoogleAuth
    gauth = GoogleAuth()
    #gauth.LoadClientConfigFile("path/to/client_secrets.json")
    gauth.LoadCredentialsFile("mycreds.txt")
    
    if gauth.credentials is None:
        gauth.LocalWebserverAuth()  # This should open a web browser for authentication
    elif gauth.access_token_expired:
        try:
            os.remove("mycreds.txt")
            gauth.LocalWebserverAuth()
        except Exception as e:
            print(f"Token refresh failed: {e}")
            gauth.LocalWebserverAuth()  # Re-authenticate if refresh fails
    else:
        gauth.Authorize()
    
    gauth.SaveCredentialsFile("mycreds.txt")  # Save credentials after successful authentication
    drive = GoogleDrive(gauth)
    
    # Specify the original directory containing the files
    original_directory = 'pick_lists'
    driveFolderID = '1uChYNo09m0YhU5zKvBnqdnsMxeKvxtFX'
    
    # Create a temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        # Copy files to the temporary directory
        for filename in os.listdir(original_directory):
            file_path = os.path.join(original_directory, filename)
            
            if os.path.isfile(file_path):
                # Copy to temporary directory
                temp_file_path = os.path.join(temp_dir, filename)
                shutil.copy2(file_path, temp_file_path)
                
                try:
                    # Upload the file to Google Drive
                    file1 = drive.CreateFile({'title': filename, 'parents': [{'id': driveFolderID}]})
                    file1.SetContentFile(temp_file_path)
                    file1.Upload()
                    print(f'Uploaded: {filename}')
                    
                    file1 = None
                    
                except Exception as e:
                    print(f'An error occurred while processing {filename}: {e}')
    
    print('All files processed!')

def fetch_order_list():
    count = 100
    iterator = 0
    all_orders = []
    
    while True:
        params = {
            'include': 'pickLines.product,shipLines,packLines.product,lines',
            'filter[inventoryStatus][]': ['started'],
            'filter[isActive]': 'true',
            'count': count,
            'skip': iterator
        }
        
        url = f'{base_url}/{company_id}/sales-orders'
        response = requests.get(url, params=params, headers=headers)
        
        if response.status_code == 200:
            print("Order list fetched successfully.")
            orders = response.json()
            
            if not orders:
                break

            all_orders.extend(orders)
            iterator += count
            
        else:
            print("Failed to fetch sales order. Status code:", response.status_code)
            print("Response content:", response.content)
            return None
    
    return all_orders

def get_po_numbers(orders):
    po_numbers = set()
    for order in orders:
        if order['inventoryStatus'] == 'started':
            po_numbers.add((order['poNumber'], order['orderNumber']))
    return sorted(list(po_numbers), key=lambda x: x[1])  # Sort by order number

def generate_formatted_lists_by_po(orders, selected_pos):
    formatted_data = []
    
    for order in orders:
        po_number = order.get('poNumber', '')
        if po_number in selected_pos and (order['inventoryStatus'] == 'started'):
            formatted_data.append(order)
    
    return formatted_data

def save_to_json(formatted_data):
    file_path = "order_data.json"
    with open(file_path, 'w') as json_file:
        json.dump(formatted_data, json_file, indent=4)
    print(f"Data saved to {file_path}")

def on_closing(root):
    print("Script closed by user.")
    root.destroy()
    exit(0)


def display_po_selection(orders, all_orders_ref):
    def on_select_po():
        selected_pos = [po[0] for i, (po, var) in enumerate(zip(po_numbers, check_vars)) if var.get()]
        print("Selected POs:", selected_pos)  # Debug information
        if selected_pos:
            process_selected_pos(selected_pos, all_orders_ref)
            root.quit()
    
    root = tk.Tk()
    root.title("Select PO Numbers")
    
    po_numbers = get_po_numbers(orders)
    
    main_frame = ttk.Frame(root, padding="10")
    main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

    # Add a label showing this is for recent started orders
    info_label = ttk.Label(main_frame, text="UNFULFILLED + STARTED orders (most recent):")
    info_label.pack(pady=(0, 10))
    
    check_vars = []
    for po, order in po_numbers:
        var = tk.BooleanVar()
        check_vars.append(var)
        cb = ttk.Checkbutton(main_frame, text=f"PO: {po}, Order: {order}", variable=var)
        cb.pack(anchor=tk.W)
    
    continue_button = ttk.Button(main_frame, text="Continue", command=on_select_po)
    continue_button.pack(pady=10)
    
    root.protocol("WM_DELETE_WINDOW", lambda: on_closing(root))
    
    root.mainloop()
    root.destroy()

#FIXME: Make select all work to where you can filter out certain serials
def serialSelector(item_dict: dict) -> list:
    selected_items = []

    def toggle_all():
        state = select_all_var.get()
        for var in item_vars.values():
            var.set(state)

    def add_selected():
        selected_items.clear()
        for name, serials in item_dict.items():
            for serial in serials:
                if item_vars[(name, serial)].get():  # Only add if selected
                    selected_items.append(serial)
        window.quit()

    # Create window
    window = tk.Toplevel()
    window.title("Imageable Items")

    # Title label (VISIBLE inside the window)
    title_label = tk.Label(window, text="Select Imageable Items", font=('Arial', 14, 'bold'))
    title_label.pack(pady=(10, 5))
    
    # Frame for checkboxes
    checkbox_frame = tk.Frame(window)
    checkbox_frame.pack(padx=10, pady=10)

    # Select All checkbox
    select_all_var = tk.BooleanVar()
    select_all_cb = tk.Checkbutton(checkbox_frame, text="Select All", variable=select_all_var, command=toggle_all)
    select_all_cb.pack(anchor="w")

    # Dictionary to track each checkbox's variable
    item_vars = {}

    # Create checkboxes per computer and serial number
    for comp_name, serials in item_dict.items():
        comp_label = tk.Label(checkbox_frame, text=f"{comp_name}:", font=('Arial', 10, 'bold'))
        comp_label.pack(anchor="w", padx=5, pady=(5, 0))
        for serial in serials:
            var = tk.BooleanVar()
            cb = tk.Checkbutton(checkbox_frame, text=f"  {serial}", variable=var)
            cb.pack(anchor="w", padx=15)
            item_vars[(comp_name, serial)] = var

    # Add button
    add_btn = tk.Button(window, text="Add Selected to List", command=add_selected)
    add_btn.pack(pady=10)

    window.protocol("WM_DELETE_WINDOW", lambda: on_closing(window))
    # Run the GUI loop
    window.mainloop()
    window.destroy()

    return selected_items

def process_selected_pos(selected_pos, all_orders):
    formatted_lists = generate_formatted_lists_by_po(all_orders, selected_pos)
    
    if not formatted_lists:
        print("No formatted lists found.")


    # Save the updated list to JSON file
    save_to_json(formatted_lists)



    pdfGenerator(formatted_lists)
    urlList = urlListGenerator(formatted_lists)
    openBrowser(urlList)
    
    # Ensure script exits cleanly
    print("Completed processing. Exiting script.")

def filter_picklines(_json: dict, pickLines: list) -> list:
    packLines = _json.get("packLines", [])

    # 1) Build a summary of shipped quantities & serials by productId
    shippedItems = {}
    for pack in packLines:
        pid = pack["productId"]
        qty = float(pack["quantity"]["standardQuantity"])
        serials = pack["quantity"].get("serialNumbers", [])

        if pid not in shippedItems:
            shippedItems[pid] = {
                "quantity": 0.0,
                "serialNumbers": set()
            }

        shippedItems[pid]["quantity"] += qty
        shippedItems[pid]["serialNumbers"].update(serials)

    trackedOrders = {}
    for pick in pickLines:
        pid = pick["productId"]
        qty = float(pick["quantity"]["standardQuantity"])
        serials = pick["quantity"].get("serialNumbers", [])

        if pid not in trackedOrders:
            trackedOrders[pid] = {
                **pick,
                "quantity": {
                    "standardQuantity": qty,
                    "serialNumbers": list(serials)
                }
            }
        else:
            trackedOrders[pid]["quantity"]["standardQuantity"] += qty
            trackedOrders[pid]["quantity"]["serialNumbers"].extend(serials)

    # Step 3: Subtract shipped from picked to get unshipped
    unshipped = []
    for pid, pick in trackedOrders.items():
        picked_qty = pick["quantity"]["standardQuantity"]
        picked_serials = pick["quantity"].get("serialNumbers", [])
        track_serials = pick["product"].get("trackSerials", False)

        shipped = shippedItems.get(pid, {"quantity": 0.0, "serialNumbers": set()})
        shipped_qty = shipped["quantity"]
        shipped_serials = shipped["serialNumbers"]

        remaining_qty = picked_qty - shipped_qty

        if remaining_qty <= 0:
            continue  # everything shipped

        unshipped_entry = {
            **pick,
            "quantity": {
                "standardQuantity": str(remaining_qty),
                "serialNumbers": []
            }
        }

        if track_serials:
            # Remove shipped serials from picked serials
            remaining_serials = [sn for sn in picked_serials if sn not in shipped_serials]
            unshipped_entry["quantity"]["serialNumbers"] = remaining_serials
            # Adjust quantity to number of serials remaining
            unshipped_entry["quantity"]["standardQuantity"] = str(len(remaining_serials))

        unshipped.append(unshipped_entry)

            # --- DEBUG OUTPUT ---
    print("\n=== DEBUG: Unshipped pick lines ===")
    print(json.dumps(unshipped, indent=2))
    print("===================================\n")

    return unshipped

def page_break(pdf: canvas.Canvas, y_offset: int, height: int) -> None:

    if y_offset < 60:
        pdf.showPage()
        y_offset = height - 50

def format_imaging_serials(picklines: list) -> dict:
    formatted_imaging_hash = {}
    for line in picklines:
        if line['product']['categoryId'] in system_ids:
            formatted_imaging_hash[line['product']['name']] = line['quantity']['serialNumbers']
    
    return formatted_imaging_hash

def create_pdf(_json: dict, filename: str) -> None:
    # Extracting variables from JSON for the order
    imaged = False

    poNum = _json.get("poNumber", "")
    pickLines = _json.get("pickLines", [])
    customerName = _json.get("contactName", "")
    email = _json.get("email", "")
    orderNumber = _json.get("orderNumber", "")
    address = _json.get("shippingAddress", {}).get("address1", "")
    order_remarks = _json.get('orderRemarks', '')
    lines = _json.get('lines', [])

    pickLines = filter_picklines(_json, pickLines)

    # Creating PDF object
    pdf = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Draw the logo in the top-left corner
    logo_width = 150  # Adjust logo size
    logo_height = 50
    pdf.drawImage(ROOT_DIR + "/static/tamu_tech_services.png", 50, height - logo_height - 20, width=logo_width, height=logo_height, preserveAspectRatio=True, mask='auto')
    
    # Set margins and starting point for text
    x_offset = 50
    y_offset = height - 80
    
    # Set PDF title
    pdf.setTitle(f"PO Number: {poNum}")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(x_offset, y_offset, f"WCDC - TechHub")
    pdf.drawRightString(width - x_offset, y_offset, f"Customer: {customerName}")
    y_offset -= 15
    pdf.drawString(x_offset, y_offset, f"474 Agronomy Rd")
    pdf.drawRightString(width - x_offset, y_offset, f"Email: {email}")
    y_offset -= 15
    pdf.setFont("Helvetica", 10)
    pdf.drawString(x_offset, y_offset, f"College Station, TX")
    pdf.drawRightString(width - x_offset, y_offset, f"PO Number: {poNum}")
    y_offset -= 15
    pdf.drawString(x_offset, y_offset, f"77843 USA")
    pdf.drawRightString(width - x_offset, y_offset, f"Shipping Address: {address}")
    y_offset -= 15
    
    # Add Recipient UIN(s) or Name(s) inline and right-aligned
    recipient_info = _json.get("customFields", {}).get("custom4", "")
    full_text = f"Recipient UIN(s) or Name(s): {recipient_info}"
    pdf.drawRightString(width - x_offset, y_offset, full_text)
    y_offset -= 15
    pdf.line(x_offset, y_offset - 5, x_offset + 500, y_offset - 5)
    y_offset -= 25
    
    # Add Order Header
    pdf.setFont("Times-Bold", 16)
    pdf.drawString(x_offset, y_offset, f"Order Number: {orderNumber}")
    y_offset -= 25
    
    # Loop through pickLines to display item details
    pdf.setFont("Times-Bold", 14)
    pdf.drawString(x_offset, y_offset, "Items:")
    y_offset -= 25
    pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)
    
    pdf.setFont("Helvetica", 12)
    
    for item in pickLines:
        product = item.get('product', {})
        item_name = product.get('name', '').upper()
        sku = product.get('sku', "")
        quantity = item.get('quantity', {})
        standard_quantity = quantity.get('standardQuantity', "")
        serial_numbers = quantity.get('serialNumbers', [])
        
        # Add product name and quantity
        pdf.setFont("Helvetica-Oblique", 11)
        pdf.drawString(x_offset, y_offset, f"{item_name} (SKU: {sku})")
        pdf.drawRightString(width - x_offset, y_offset, f"{standard_quantity.replace('.0', '')} item(s)")
        y_offset -= 20
        
        page_break(pdf, y_offset, height)
        
        # Add serial numbers if available
        if serial_numbers:
            serial_text = "Serial Numbers: " + ", ".join(serial_numbers)
            max_width = width - x_offset - 50  # Allow space for margins
            
            # Create a text object for better control over the text
            text_object = pdf.beginText(x_offset, y_offset)
            text_object.setFont("Helvetica-Bold", 11)
            
            words = serial_text.split(' ')
            current_line = ""
            for word in words:
                if pdf.stringWidth(current_line + word, "Helvetica", 11) < max_width:
                    current_line += word + " "
                else:
                    # Write current line and start a new one
                    text_object.textLine(current_line.strip())
                    current_line = word + " "
                    # Adjust y_offset to prevent overlapping
                    y_offset -= 15
                    if y_offset < 60:
                        pdf.drawText(text_object)
                        pdf.showPage()
                        text_object = pdf.beginText(x_offset, height - 50)
                        y_offset = height - 50
            
            # Write the last line
            if current_line:
                text_object.textLine(current_line.strip())
                y_offset -= 20
            
            pdf.drawText(text_object)
        
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)
        y_offset -= 5
    
    # Check for page break
    page_break(pdf, y_offset, height)
    
    y_offset -= 20
    
    # Check for page break
    page_break(pdf, y_offset, height)
    
    imaged = imagingChecker(lines)
    if imaged:
        imaged_items = format_imaging_serials(pickLines)
        chosen_serials = serialSelector(imaged_items)
        quantity = len(chosen_serials)

        pdf.setFont("Times-Bold", 14)
        pdf.drawString(x_offset, y_offset, "Services:")
        y_offset -= 20
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)

        page_break(pdf, y_offset, height)
        
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x_offset, y_offset, f"Computer Imaging: ")
        pdf.setFont("Helvetica-Oblique", 11)
        pdf.drawRightString(width - x_offset, y_offset, f"{quantity} item(s)")
        y_offset -= 20

        page_break(pdf, y_offset, height)

        imaged_serials = "Serial Numbers: " + ", ".join(chosen_serials)
        max_width = width - x_offset - 50  # Allow space for margins
        
        # Create a text object for better control over the text
        text_object = pdf.beginText(x_offset, y_offset)
        text_object.setFont("Helvetica-Bold", 11)
        
        words = imaged_serials.split(' ')
        current_line = ""
        for word in words:
            if pdf.stringWidth(current_line + word, "Helvetica", 11) < max_width:
                current_line += word + " "
            else:
                # Write current line and start a new one
                text_object.textLine(current_line.strip())
                current_line = word + " "
                # Adjust y_offset to prevent overlapping
                y_offset -= 15
                if y_offset < 60:
                    pdf.drawText(text_object)
                    pdf.showPage()
                    text_object = pdf.beginText(x_offset, height - 50)
                    y_offset = height - 50
        
        # Write the last line
        if current_line:
            text_object.textLine(current_line.strip())
            y_offset -= 20
        
        pdf.drawText(text_object)

    y_offset -= 10
    page_break(pdf, y_offset, height)

    pdf.setFont("Times-Bold", 14)
    pdf.drawString(x_offset, y_offset, "Order Remarks:")
    y_offset -= 20
    pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)
    
    page_break(pdf, y_offset, height)
    
    pdf.setFont("Helvetica-Bold", 11)
    wrapped_lines = wrap_text(order_remarks, max_width=500, font_name="Helvetica-Bold", font_size=11)
    for line in wrapped_lines:
        if y_offset < 60:
            pdf.showPage()
            y_offset = height - 50
            pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x_offset, y_offset, line)
        y_offset -= 14  # line spacing

    #pdf.drawString(x_offset, y_offset, f"{order_remarks}")
    
    # Draw signature line and label
    pdf.setFont("Helvetica", 12)
    pdf.drawString(x_offset, 70, "Customer Signature:")
    pdf.line(x_offset, 60, x_offset + 500, 60)  # Line for signature
    
    # Save the PDF file
    pdf.save()
    print(f"{filename} is saved!")

def pdfGenerator(json_array: list) -> None:
    # Ensure the pick_lists directory exists
    os.makedirs("pick_lists", exist_ok=True)
    
    # Iterate throughout the list of jsons
    for picklist in json_array:
        orderNum = picklist.get("orderNumber", "")
        filename = f"pick_lists/Pick list - {orderNum}.pdf"
        create_pdf(picklist, filename)

def urlListGenerator(json_array: list) -> list:
    urlList = []
    for picklist in json_array:
        sales_order_id = picklist.get("salesOrderId", "")
        googleURL = "https://app.inflowinventory.com/sales-orders/" + sales_order_id
        urlList.append(googleURL)
    
    return urlList

def openBrowser(urlList: list) -> None:
    def openChrome(url):
        webbrowser.get("C:/Program Files/Google/Chrome/Application/chrome.exe %s").open(url)
    
    threads = []
    
    for url in urlList:
        thread = threading.Thread(target=openChrome, args=(url,))
        threads.append(thread)
        thread.start()
    
    for thread in threads:
        thread.join()

def print_pdf_windows(file_path: str):
    # Ensure the file exists before proceeding
    if not os.path.exists(file_path):
        print(f"File {file_path} does not exist.")
        return
    
    # Use ShellExecute to send the file to the default PDF viewer's print function
    try:
        printer_name = "Brother MFC-L2750DW series"
        file = open(file_path, "rb")
        printer = win32print.OpenPrinter(printer_name)
        
        task = win32print.StartDocPrinter(printer, 1, (file_path, None, "RAW"))
        
        win32print.StartPagePrinter(printer)
        
        win32print.WritePrinter(printer, file.read())
        
        win32print.EndPagePrinter(printer)
        win32print.EndDocPrinter(printer)
        
        win32print.ClosePrinter(printer)
        
        file.close()
        print(f"Printing {file_path} successfully.")
    except Exception as e:
        print(f"Failed to print {file_path}. Error: {e}")

def process_files_for_printing(original_directory: str, winLock):
    """Process PDF files for printing through a temporary directory."""
    # Create a temporary directory
    winLock.acquire()
    with tempfile.TemporaryDirectory() as temp_dir:
        # List files in the original directory
        for filename in os.listdir(original_directory):
            file_path = os.path.join(original_directory, filename)
            
            # Process only PDF files
            if filename.endswith('.pdf') and os.path.isfile(file_path):
                try:
                    # Copy file to temporary directory
                    temp_file_path = os.path.join(temp_dir, filename)
                    shutil.copy2(file_path, temp_file_path)
                    
                    # Print the file from the temporary directory
                    print_pdf_windows(temp_file_path)
                    
                    time.sleep(3)
                    
                    # After printing, remove the file from the original directory (if needed)
                    os.remove(file_path)
                    print(f"Deleted: {file_path}")
                    
                except Exception as e:
                    print(f"An error occurred while processing {filename}: {e}")
    winLock.release()

def main():
    # First, check if user wants to run manual orders
    manual_orders = prompt_manual_orders()
    
    if manual_orders:
        # Process manual orders
        all_orders = process_manual_orders(manual_orders)
        if not all_orders:
            print("No valid orders to process. Exiting.")
            sys.exit(1)
    else:
        # Fetch recent orders using the new fast method
        print("\nFetching recent UNFULFILLED orders (last 3 pages)...")
        all_orders = fetch_recent_started_orders()
        
        if not all_orders:
            print("No recent UNFULFILLED + STARTED orders found.")
            sys.exit(1)
        
        print(f"Found {len(all_orders)} started order(s)")
    
    # Display selection UI and process
    lock = Lock()
    path = "pick_lists"
    
    if all_orders:
        display_po_selection(all_orders, all_orders)
        driveUpload()
        thread = threading.Thread(target=process_files_for_printing, args=(path, lock))
        thread.start()
        thread.join()
    
    sys.exit(0)

if __name__ == "__main__":
    main()
