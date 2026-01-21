"""
Picklist Service for generating picklist PDFs.

Extracted from OrderService for better separation of concerns.
"""

import logging
from typing import Dict, Any, List

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth

logger = logging.getLogger(__name__)


class PicklistService:
    """Service for generating picklist PDFs from inFlow order data."""

    def generate_picklist_pdf(self, inflow_data: Dict[str, Any], output_path: str) -> None:
        """Generate a picklist PDF from inFlow order data."""
        # Extract order data
        po_number = inflow_data.get("poNumber", "")
        pick_lines = inflow_data.get("pickLines", [])
        customer_name = inflow_data.get("contactName", "")
        email = inflow_data.get("email", "")
        order_number = inflow_data.get("orderNumber", "")
        shipping_address = inflow_data.get("shippingAddress", {}).get("address1", "")
        order_remarks = inflow_data.get('orderRemarks', '')

        # Filter pick lines (remove already shipped items)
        pick_lines = self.filter_picklines(inflow_data, pick_lines)

        # Create PDF
        pdf = canvas.Canvas(output_path, pagesize=letter)
        width, height = letter

        # Set PDF title
        pdf.setTitle(f"PO Number: {po_number}")
        pdf.setFont("Helvetica", 10)

        # Header
        x_offset = 50
        y_offset = height - 80

        pdf.drawString(x_offset, y_offset, f"WCDC - TechHub")
        pdf.drawRightString(width - x_offset, y_offset, f"Customer: {customer_name}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"474 Agronomy Rd")
        pdf.drawRightString(width - x_offset, y_offset, f"Email: {email}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"College Station, TX")
        pdf.drawRightString(width - x_offset, y_offset, f"PO Number: {po_number}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"77843 USA")
        pdf.drawRightString(width - x_offset, y_offset, f"Shipping Address: {shipping_address}")
        y_offset -= 15

        # Add Recipient UIN(s) or Name(s)
        recipient_info = inflow_data.get("customFields", {}).get("custom4", "")
        pdf.drawRightString(width - x_offset, y_offset, f"Recipient UIN(s) or Name(s): {recipient_info}")
        y_offset -= 15
        pdf.line(x_offset, y_offset - 5, x_offset + 500, y_offset - 5)
        y_offset -= 25

        # Order Header
        pdf.setFont("Times-Bold", 16)
        pdf.drawString(x_offset, y_offset, f"Order Number: {order_number}")
        y_offset -= 25

        # Items section
        pdf.setFont("Times-Bold", 14)
        pdf.drawString(x_offset, y_offset, "Items:")
        y_offset -= 25
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)

        pdf.setFont("Helvetica", 12)

        for item in pick_lines:
            product = item.get('product', {})
            item_name = product.get('name', '').upper()
            sku = product.get('sku', "")
            quantity = item.get('quantity', {})
            standard_quantity = quantity.get('standardQuantity', "")
            serial_numbers = quantity.get('serialNumbers', [])

            # Product name and quantity
            pdf.setFont("Helvetica-Oblique", 11)
            pdf.drawString(x_offset, y_offset, f"{item_name} (SKU: {sku})")
            pdf.drawRightString(width - x_offset, y_offset, f"{standard_quantity.replace('.0', '')} item(s)")
            y_offset -= 20

            y_offset = self._check_page_break(pdf, y_offset, height)

            # Serial numbers
            if serial_numbers:
                serial_text = "Serial Numbers: " + ", ".join(serial_numbers)
                max_width = width - x_offset - 50

                text_object = pdf.beginText(x_offset, y_offset)
                text_object.setFont("Helvetica-Bold", 11)

                words = serial_text.split(' ')
                current_line = ""
                for word in words:
                    if pdf.stringWidth(current_line + word, "Helvetica", 11) < max_width:
                        current_line += word + " "
                    else:
                        text_object.textLine(current_line.strip())
                        current_line = word + " "
                        y_offset -= 15
                        y_offset = self._check_page_break(pdf, y_offset, height)
                        if y_offset == height - 50:  # Page break occurred
                            text_object = pdf.beginText(x_offset, y_offset)
                            text_object.setFont("Helvetica-Bold", 11)

                if current_line:
                    text_object.textLine(current_line.strip())
                    y_offset -= 20

                pdf.drawText(text_object)

            pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)
            y_offset -= 5

        # Order Remarks
        y_offset -= 20
        y_offset = self._check_page_break(pdf, y_offset, height)

        pdf.setFont("Times-Bold", 14)
        pdf.drawString(x_offset, y_offset, "Order Remarks:")
        y_offset -= 20
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)

        y_offset = self._check_page_break(pdf, y_offset, height)

        pdf.setFont("Helvetica-Bold", 11)
        wrapped_lines = self._wrap_text(order_remarks, 500, "Helvetica-Bold", 11)
        for line in wrapped_lines:
            if y_offset < 60:
                pdf.showPage()
                y_offset = height - 50
                pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(x_offset, y_offset, line)
            y_offset -= 14

        # Signature line
        pdf.setFont("Helvetica", 12)
        pdf.drawString(x_offset, 70, "Customer Signature:")
        pdf.line(x_offset, 60, x_offset + 500, 60)

        pdf.save()
        logger.info(f"Picklist PDF generated: {output_path}")

    def filter_picklines(self, inflow_data: Dict[str, Any], pick_lines: List[Dict]) -> List[Dict]:
        """Filter pick lines to show only unshipped items."""
        pack_lines = inflow_data.get("packLines", [])

        # Build summary of shipped quantities & serials
        shipped_items = {}
        for pack in pack_lines:
            pid = pack["productId"]
            qty = float(pack["quantity"]["standardQuantity"])
            serials = pack["quantity"].get("serialNumbers", [])

            if pid not in shipped_items:
                shipped_items[pid] = {
                    "quantity": 0.0,
                    "serialNumbers": set()
                }

            shipped_items[pid]["quantity"] += qty
            shipped_items[pid]["serialNumbers"].update(serials)

        # Track picked items
        tracked_orders = {}
        for pick in pick_lines:
            pid = pick["productId"]
            qty = float(pick["quantity"]["standardQuantity"])
            serials = pick["quantity"].get("serialNumbers", [])

            if pid not in tracked_orders:
                tracked_orders[pid] = {
                    **pick,
                    "quantity": {
                        "standardQuantity": qty,
                        "serialNumbers": list(serials)
                    }
                }
            else:
                tracked_orders[pid]["quantity"]["standardQuantity"] += qty
                tracked_orders[pid]["quantity"]["serialNumbers"].extend(serials)

        # Subtract shipped from picked to get unshipped
        unshipped = []
        for pid, pick in tracked_orders.items():
            picked_qty = pick["quantity"]["standardQuantity"]
            picked_serials = pick["quantity"].get("serialNumbers", [])
            track_serials = pick["product"].get("trackSerials", False)

            shipped = shipped_items.get(pid, {"quantity": 0.0, "serialNumbers": set()})
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

        return unshipped

    def _check_page_break(self, pdf: canvas.Canvas, y_offset: int, height: int) -> int:
        """Check if page break is needed and return updated y_offset."""
        if y_offset < 60:
            pdf.showPage()
            return height - 50
        return y_offset

    def _wrap_text(self, text: str, max_width: int, font_name: str, font_size: int) -> List[str]:
        """Wrap text to fit within max_width, respecting explicit newlines."""
        if not text:
            return []

        # First split on explicit newlines to respect intentional line breaks
        paragraphs = str(text).split('\n')
        lines = []

        for paragraph in paragraphs:
            if not paragraph.strip():
                # Preserve blank lines
                lines.append("")
                continue

            words = paragraph.split()
            line = ""

            for word in words:
                test_line = f"{line} {word}".strip()
                test_width = stringWidth(test_line, font_name, font_size)
                if test_width <= max_width:
                    line = test_line
                else:
                    if line:
                        lines.append(line)
                    line = word

            if line:
                lines.append(line)

        return lines


# Singleton for easy import
picklist_service = PicklistService()
