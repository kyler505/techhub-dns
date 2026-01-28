from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

print("ReportLab imported successfully")
c = canvas.Canvas("test_rl.pdf", pagesize=letter)
c.drawString(100, 100, "Hello")
c.save()
print("PDF generated successfully")
