"""
PDF Service for generating Order Details PDFs using ReportLab.
"""

import io
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
import barcode
from barcode.writer import ImageWriter

logger = logging.getLogger(__name__)

# Get templates directory
TEMPLATES_DIR = Path(__file__).parent.parent / "templates"


class PDFService:
    """Service for generating PDFs using ReportLab."""

    def __init__(self):
        self.logo_path = TEMPLATES_DIR / "tamu_logo.png"

    def _format_currency(self, value: Any) -> str:
        """Format a value as currency."""
        if value is None:
            return "$0.00"
        try:
            amount = float(value)
            return f"${amount:,.2f}"
        except (ValueError, TypeError):
            return "$0.00"

    def _format_date(self, date_str: Optional[str]) -> str:
        """Format a date string for display."""
        if not date_str:
            return datetime.now().strftime("%b %d, %Y")

        try:
            if "T" in date_str:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
            return dt.strftime("%b %d, %Y")
        except (ValueError, TypeError):
            return date_str

    def _generate_barcode_image(self, order_number: str) -> io.BytesIO:
        """Generate a Code128 barcode image and return as BytesIO."""
        code128 = barcode.get_barcode_class('code128')
        barcode_instance = code128(order_number, writer=ImageWriter())

        buffer = io.BytesIO()
        barcode_instance.write(buffer, options={
            'write_text': False,
            'module_height': 8,
            'module_width': 0.3,
            'quiet_zone': 2
        })
        buffer.seek(0)
        return buffer

    def _wrap_text(self, pdf: canvas.Canvas, text: str, max_width: float, font_name: str, font_size: int) -> list:
        """Wrap text to fit within max_width."""
        if not text:
            return []
        words = str(text).split(' ')
        lines = []
        current_line = ""

        for word in words:
            test_line = f"{current_line} {word}".strip()
            if pdf.stringWidth(test_line, font_name, font_size) <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

        return lines

    def _format_address(self, address: Dict[str, Any]) -> List[str]:
        """Format an address dictionary into display lines."""
        if not address:
            return []

        lines = []
        if address.get("address1"):
            lines.append(address.get("address1"))
        if address.get("address2"):
            lines.append(address.get("address2"))

        city_line = ""
        if address.get("city"):
            city_line = address.get("city")
        if address.get("stateOrProvince"):
            city_line += f", {address.get('stateOrProvince')}" if city_line else address.get('stateOrProvince')
        if city_line:
            lines.append(city_line)

        if address.get("postalCode"):
            lines.append(address.get("postalCode"))
        if address.get("country"):
            lines.append(address.get("country"))

        return lines

    def _extract_serials_from_lines(self, inflow_data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Extract serial numbers for each product from pickLines."""
        serials_by_product = {}

        # Get serials from pickLines
        pick_lines = inflow_data.get("pickLines", [])
        for pick_line in pick_lines:
            product = pick_line.get("product", {})
            product_name = product.get("name", "")
            quantity = pick_line.get("quantity", {})
            serial_numbers = quantity.get("serialNumbers", [])

            if product_name and serial_numbers:
                if product_name not in serials_by_product:
                    serials_by_product[product_name] = []
                serials_by_product[product_name].extend(serial_numbers)

        return serials_by_product

    def generate_order_details_pdf(
        self,
        inflow_data: Dict[str, Any],
        output_path: Optional[str] = None
    ) -> bytes:
        """
        Generate an Order Details PDF from inFlow order data.
        """
        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Extract data
        order_number = inflow_data.get("orderNumber", "")
        order_date = self._format_date(inflow_data.get("orderDate"))
        po_number = inflow_data.get("poNumber", "")
        customer_name = inflow_data.get("contactName", "")
        customer_email = inflow_data.get("email", "")
        order_remarks = inflow_data.get("orderRemarks", "")

        # Addresses
        billing_address = self._format_address(inflow_data.get("billingAddress", {}))
        shipping_address = self._format_address(inflow_data.get("shippingAddress", {}))

        # Get serial numbers by product
        serials_by_product = self._extract_serials_from_lines(inflow_data)

        # Line items with serials
        lines = inflow_data.get("lines", [])
        line_items = []
        subtotal = 0.0

        for line in lines:
            product = line.get("product", {})
            product_name = product.get("name", "Unknown Product")
            product_sku = product.get("sku", "")
            unit_price = line.get("unitPrice", 0)
            quantity_data = line.get("quantity", {})
            quantity = quantity_data.get("standardQuantity", 1)

            try:
                price = float(unit_price) if unit_price else 0
                qty = float(quantity) if quantity else 1
                item_subtotal = price * qty
            except (ValueError, TypeError):
                price = 0
                qty = 1
                item_subtotal = 0

            # Get serials for this product
            serials = serials_by_product.get(product_name, [])

            line_items.append({
                "product_name": product_name,
                "sku": product_sku,
                "quantity": int(qty) if qty == int(qty) else qty,
                "unit_price": self._format_currency(price),
                "subtotal": self._format_currency(item_subtotal),
                "serials": serials
            })
            subtotal += item_subtotal

        order_subtotal = inflow_data.get("subtotal", subtotal)
        order_total = inflow_data.get("total", order_subtotal)

        # Set PDF metadata
        pdf.setTitle(f"Order Details - {order_number}")

        # ===== HEADER SECTION =====
        x_margin = 40
        y_pos = height - 50

        # Draw logo
        if self.logo_path.exists():
            try:
                logo = ImageReader(str(self.logo_path))
                pdf.drawImage(logo, x_margin, y_pos - 35, width=140, height=45, preserveAspectRatio=True)
            except Exception as e:
                logger.warning(f"Could not load logo: {e}")

        # TechHub address (next to logo)
        pdf.setFont("Helvetica", 8)
        addr_x = x_margin + 150
        pdf.drawString(addr_x, y_pos, "WCDC - TechHub")
        pdf.drawString(addr_x, y_pos - 11, "474 Agronomy Rd")
        pdf.drawString(addr_x, y_pos - 22, "College Station, TX 77843")
        pdf.drawString(addr_x, y_pos - 33, "USA")

        # Order Details title (right side)
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawRightString(width - x_margin, y_pos, "Order Details")

        # Barcode
        try:
            barcode_buffer = self._generate_barcode_image(order_number)
            barcode_img = ImageReader(barcode_buffer)
            pdf.drawImage(barcode_img, width - x_margin - 120, y_pos - 40, width=120, height=30, preserveAspectRatio=True)
        except Exception as e:
            logger.warning(f"Could not generate barcode: {e}")

        # Order metadata
        pdf.setFont("Helvetica-Bold", 8)
        meta_y = y_pos - 50
        pdf.drawString(width - x_margin - 120, meta_y, "Order number")
        pdf.drawString(width - x_margin - 120, meta_y - 11, "PO #")
        pdf.drawString(width - x_margin - 120, meta_y - 22, "Date")

        pdf.setFont("Helvetica", 8)
        pdf.drawRightString(width - x_margin, meta_y, order_number)
        pdf.drawRightString(width - x_margin, meta_y - 11, po_number or "N/A")
        pdf.drawRightString(width - x_margin, meta_y - 22, order_date)

        y_pos -= 90

        # ===== DISCLAIMER =====
        pdf.setStrokeColor(HexColor("#dddddd"))
        pdf.setFillColor(HexColor("#f9f9f9"))
        pdf.rect(x_margin, y_pos - 35, width - 2 * x_margin, 35, fill=1)

        pdf.setFillColor(HexColor("#333333"))
        pdf.setFont("Helvetica", 7)
        disclaimer_text = "Thank you for purchasing through TechHub! Your order details and PO number are shown below."
        pdf.drawString(x_margin + 8, y_pos - 12, disclaimer_text)

        pdf.setFont("Helvetica-Bold", 7)
        pdf.setFillColor(HexColor("#cc0000"))
        pdf.drawString(x_margin + 8, y_pos - 22, "NOTE: Do not edit preliminary asset information.")

        pdf.setFillColor(HexColor("#333333"))
        pdf.setFont("Helvetica-Oblique", 7)
        pdf.drawString(x_margin + 8, y_pos - 32, "Editing preliminary asset information may result in items on your order arriving without asset tags.")

        y_pos -= 55

        # ===== BILLING & SHIPPING ADDRESS =====
        col_mid = width / 2 + 20

        pdf.setFillColor(HexColor("#333333"))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x_margin, y_pos, "Billing Address")
        pdf.drawString(col_mid, y_pos, "Shipping Address")

        pdf.setFont("Helvetica", 8)
        y_pos -= 12

        # Billing address
        addr_y = y_pos
        pdf.drawString(x_margin, addr_y, customer_name)
        for addr_line in billing_address:
            addr_y -= 10
            pdf.drawString(x_margin, addr_y, addr_line)

        # Shipping address
        ship_y = y_pos
        shipping_name = inflow_data.get("shippingAddress", {}).get("name", customer_name)
        pdf.drawString(col_mid, ship_y, shipping_name)
        for addr_line in shipping_address:
            ship_y -= 10
            pdf.drawString(col_mid, ship_y, addr_line)

        y_pos = min(addr_y, ship_y) - 15

        # ===== ORDER NUMBER & CONTACT =====
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x_margin, y_pos, "Order number")
        pdf.drawString(col_mid, y_pos, "Contact")

        pdf.setFont("Helvetica", 8)
        y_pos -= 12
        pdf.drawString(x_margin, y_pos, order_number)
        pdf.drawString(col_mid, y_pos, customer_name)

        # Email and PO
        y_pos -= 15
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x_margin, y_pos, "Email")
        pdf.drawString(col_mid, y_pos, "PO #")

        pdf.setFont("Helvetica", 8)
        y_pos -= 12
        pdf.drawString(x_margin, y_pos, customer_email or "N/A")
        pdf.drawString(col_mid, y_pos, po_number or "N/A")

        y_pos -= 25

        # ===== LINE ITEMS TABLE =====
        pdf.setStrokeColor(HexColor("#333333"))
        pdf.line(x_margin, y_pos + 5, width - x_margin, y_pos + 5)

        # Column positions
        col_product = x_margin
        col_quantity = width - x_margin - 180
        col_unit_price = width - x_margin - 110
        col_subtotal = width - x_margin - 40

        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(col_product, y_pos - 8, "Product")
        pdf.drawRightString(col_quantity + 30, y_pos - 8, "Quantity")
        pdf.drawRightString(col_unit_price + 40, y_pos - 8, "Unit Price")
        pdf.drawRightString(col_subtotal + 35, y_pos - 8, "Subtotal")

        y_pos -= 15
        pdf.line(x_margin, y_pos, width - x_margin, y_pos)

        # Table rows
        for item in line_items:
            y_pos -= 12

            # Check for page break
            if y_pos < 120:
                pdf.showPage()
                y_pos = height - 50
                pdf.setFont("Helvetica", 8)

            # Product name (bold)
            pdf.setFont("Helvetica-Bold", 8)
            pdf.drawString(col_product, y_pos, item["product_name"])

            # Quantity, Unit Price, Subtotal (on same line as product name)
            pdf.setFont("Helvetica", 8)
            pdf.drawRightString(col_quantity + 30, y_pos, str(item["quantity"]))
            pdf.drawRightString(col_unit_price + 40, y_pos, item["unit_price"])
            pdf.drawRightString(col_subtotal + 35, y_pos, item["subtotal"])

            # SKU on line below product name (italicized)
            if item["sku"]:
                y_pos -= 10
                pdf.setFont("Helvetica-Oblique", 7)
                pdf.drawString(col_product, y_pos, item["sku"])

            # Serial numbers (on lines below product name)
            if item["serials"]:
                pdf.setFont("Helvetica", 7)
                pdf.setFillColor(HexColor("#666666"))

                # Format serials in groups
                serials = item["serials"]
                serials_per_line = 6
                serial_y = y_pos

                for i in range(0, len(serials), serials_per_line):
                    serial_y -= 10
                    if serial_y < 100:
                        pdf.showPage()
                        serial_y = height - 50
                        pdf.setFont("Helvetica", 7)
                        pdf.setFillColor(HexColor("#666666"))

                    chunk = serials[i:i+serials_per_line]
                    serial_text = "  ".join(chunk)
                    pdf.drawString(col_product + 10, serial_y, serial_text)

                y_pos = serial_y
                pdf.setFillColor(HexColor("#333333"))

            y_pos -= 5
            pdf.setStrokeColor(HexColor("#dddddd"))
            pdf.line(x_margin, y_pos, width - x_margin, y_pos)

        # ===== REMARKS =====
        if order_remarks:
            y_pos -= 20
            if y_pos < 100:
                pdf.showPage()
                y_pos = height - 50

            pdf.setFont("Helvetica-Bold", 9)
            pdf.setFillColor(HexColor("#333333"))
            pdf.drawString(x_margin, y_pos, "Remarks")

            y_pos -= 12
            pdf.setFont("Helvetica", 8)

            # Wrap remarks text
            remark_lines = self._wrap_text(pdf, order_remarks, width - 2 * x_margin, "Helvetica", 8)
            for line in remark_lines:
                if y_pos < 80:
                    pdf.showPage()
                    y_pos = height - 50
                    pdf.setFont("Helvetica", 8)
                pdf.drawString(x_margin, y_pos, line)
                y_pos -= 10

        # ===== TOTALS =====
        y_pos -= 20
        if y_pos < 80:
            pdf.showPage()
            y_pos = height - 50

        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(col_unit_price + 40, y_pos, "Subtotal")
        pdf.drawRightString(col_subtotal + 35, y_pos, self._format_currency(order_subtotal))

        y_pos -= 15
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setStrokeColor(HexColor("#333333"))
        pdf.line(col_unit_price - 10, y_pos + 12, width - x_margin, y_pos + 12)
        pdf.drawRightString(col_unit_price + 40, y_pos, "Total")
        pdf.drawRightString(col_subtotal + 35, y_pos, self._format_currency(order_total))

        # Save PDF
        pdf.save()

        pdf_bytes = buffer.getvalue()
        buffer.close()

        if output_path:
            with open(output_path, 'wb') as f:
                f.write(pdf_bytes)

        return pdf_bytes

    def generate_order_details_pdf_stream(
        self,
        inflow_data: Dict[str, Any]
    ) -> io.BytesIO:
        """Generate an Order Details PDF and return as a BytesIO stream."""
        pdf_bytes = self.generate_order_details_pdf(inflow_data)
        return io.BytesIO(pdf_bytes)


# Singleton instance
pdf_service = PDFService()
