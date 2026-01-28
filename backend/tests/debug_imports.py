import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))

print("Importing app...")
import app
print("Importing app.database...")
import app.database
print("Importing app.models.order...")
import app.models.order
print("Importing app.schemas.order...")
import app.schemas.order
print("Importing app.services.order_service...")
import app.services.order_service

print("All imports successful")
