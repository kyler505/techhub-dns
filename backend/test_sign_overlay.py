
import os
import base64
import io
from PIL import Image, ImageDraw
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter

def create_base_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    c.setFont("Helvetica", 20)
    c.drawString(100, 700, "Background Text - Should be visible")
    c.drawString(100, 100, "Signature Line ____________________")
    c.showPage()
    c.save()

def create_full_page_signature_b64(width, height):
    # Create RGBA image
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0)) # Transparent
    d = ImageDraw.Draw(img)

    # Draw "signature" near bottom where line is (approx y=100 from bottom)
    # PIL origin is top-left. Height is say 792. y=100 from bottom is y=692.
    d.line([100, height-100, 300, height-100], fill=(0, 0, 255, 255), width=5)
    d.text((100, height-120), "Full Page Overlay Signature", fill=(255, 0, 0, 255))

    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

def apply_full_page_signature(pdf_path, signature_b64):
    try:
        signature_data_bytes = base64.b64decode(signature_b64.split(',')[1])
        signature_image = Image.open(io.BytesIO(signature_data_bytes))
        print(f"Signature Image Mode: {signature_image.mode}")
    except Exception as e:
        print(f"Error processing signature image: {e}")
        return

    reader = PdfReader(pdf_path)
    page = reader.pages[0]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)

    print(f"Page size: {page_width}x{page_height}")

    # Create overlay PDF
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as overlay_file:
        overlay_path = overlay_file.name

    c = canvas.Canvas(overlay_path, pagesize=(page_width, page_height))

    # Draw full page image
    # Note: reportlab drawImage supports mask='auto' for transparency
    c.drawImage(ImageReader(signature_image), 0, 0, width=page_width, height=page_height, mask='auto')
    c.save()

    print(f"Overlay created at {overlay_path}")

    # Merge
    writer = PdfWriter()
    overlay_reader = PdfReader(overlay_path)
    overlay_page = overlay_reader.pages[0]

    page.merge_page(overlay_page)
    writer.add_page(page)

    output_path = pdf_path.replace('.pdf', '-processed.pdf')
    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Saved to {output_path}")

    try:
        os.unlink(overlay_path)
    except:
        pass

if __name__ == "__main__":
    test_pdf = "test_overlay.pdf"
    create_base_pdf(test_pdf)
    # Assume 72 dpi for points?
    # Frontend canvas pixel size depends on device pixel ratio, but let's simulate reasonable size.
    # Letter 612x792 points. Image might be larger pixels.
    sig_b64 = create_full_page_signature_b64(1224, 1584)
    apply_full_page_signature(test_pdf, sig_b64)
