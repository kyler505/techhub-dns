# backend/app/templates/

## Responsibility

- Provides the static assets that describe the TechHub order details document: `order_details.html` models the layout, markup, and placeholders, while `tamu_logo.png` supplies the branded header image. This directory serves as the human-readable specification for order detail documents that the backend materializes.

## Design Patterns

- `order_details.html` is written in Jinja-style markup (e.g., `{{ order_number }}` and `{% for item in line_items %}`) so that any templating render can inject order metadata, customer info, addresses, and line items. The template is letter-sized, print-focused HTML with an `@page` rule, inline scoped styles, and grid-like sections for headers, disclaimers, billing/contact blocks, the item table, and totals.
- Visual elements such as the logo, barcode image, and disclaimer copy are driven by placeholders (`logo_path`, `barcode_path`, `order_date`, `subtotal`, etc.), letting a renderer swap assets or data without touching the CSS-heavy structure. The layout explicitly handles empty line items (`{% else %}`) so generated documents degrade gracefully.

## Flow

- Template rendering expects a context that mirrors what the PDF/email pipeline already produces: order metadata (number, date, PO, customer name/email), billing/shipping addresses, `line_items` (each with `product_name`, `unit_price`, `subtotal`, `serials`), and summary totals (`subtotal`, `total`).
- The data/control flow is typically `OrderService` → `PDFService.generate_order_details_pdf` → document generation/export: the service builds the ordered dictionary of line items/addresses, passes the context to whichever rendering pipeline (HTML renderer or ReportLab draw logic), and either streams or persists the output.
- Even though the current PDF implementation draws directly via ReportLab, this template codifies the same structure so any HTML-to-PDF tooling or manual rendering shares the same expectations for field names, branding, and fallback copy.

## Integration

- `backend/app/services/pdf_service.py` references `tamu_logo.png` from this folder and mirrors the `order_details.html` structure in ReportLab drawing code, keeping the printed document consistent with the template (header, disclaimer, info blocks, totals table). `OrderService._send_order_details_email` orchestrates the pipeline: it gathers Inflow data, calls `PDFService.generate_order_details_pdf`, writes the file, updates the order record (`order_details_path`, `order_details_generated_at`), and kicks off SharePoint upload/print tasks.
- `backend/app/services/email_service.py` sends the resulting PDF as an attachment, along with inline HTML copy, to the customer via Microsoft Graph. The template therefore sits at the center of document generation: it defines what the final order detail should look like and is aligned with both the PDF renderer and the email delivery workflow.
