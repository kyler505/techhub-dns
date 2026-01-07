
import os
import base64
import io
from PIL import Image, ImageDraw
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter

def create_dummy_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    c.drawString(100, 700, "Hello World")
    c.drawString(100, 100, "Signature goes here:")
    c.showPage()
    c.save()

def create_dummy_signature_b64():
    img = Image.new('RGB', (200, 100), color = (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10,10), "Test Signature", fill=(0,0,0))
    d.line([0,0, 200, 100], fill=(0,0,0), width=3)

    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

def apply_signature(pdf_path, signature_b64, position={'x': 50, 'y': 80}): # y=80 should be near bottom
    try:
        signature_data_bytes = base64.b64decode(signature_b64.split(',')[1])
        signature_image = Image.open(io.BytesIO(signature_data_bytes))
    except Exception as e:
        print(f"Error processing signature image: {e}")
        return

    reader = PdfReader(pdf_path)
    page_number = 1
    page = reader.pages[page_number - 1]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)

    print(f"Page size: {page_width}x{page_height}")

    sig_x = (position.get('x', 50) / 100.0) * page_width
    sig_y = (position.get('y', 60) / 100.0) * page_height # % from top?

    sig_width = 200
    sig_height = 100

    # Calculate reportlab y (bottom-left origin)
    # If sig_y (from top) is 80% -> 0.8 * 792 = 633.6
    # reportlab_y = 792 - 633.6 - 100 = 58.4

    reportlab_x = sig_x
    reportlab_y = page_height - sig_y - sig_height

    print(f"Drawing at: x={reportlab_x}, y={reportlab_y}")

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as overlay_file:
        overlay_path = overlay_file.name

    # ISSUE: canvas needs to be closed before read?
    c = canvas.Canvas(overlay_path, pagesize=(page_width, page_height))
    c.drawImage(ImageReader(signature_image), reportlab_x, reportlab_y, width=sig_width, height=sig_height)
    c.save() # This writes and closes the file handle used by canvas?

    print(f"Overlay created at {overlay_path}")

    writer = PdfWriter()

    overlay_reader = PdfReader(overlay_path)
    overlay_page = overlay_reader.pages[0]

    page.merge_page(overlay_page)
    writer.add_page(page)

    output_path = pdf_path.replace('.pdf', '-signed.pdf')
    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Signed PDF saved to {output_path}")

    # Cleanup
    try:
        os.unlink(overlay_path)
    except:
        pass

if __name__ == "__main__":
    dummy_pdf = "test_doc.pdf"
    create_dummy_pdf(dummy_pdf)
    sig = create_dummy_signature_b64()
    apply_signature(dummy_pdf, sig)
