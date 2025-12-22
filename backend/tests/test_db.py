#!/usr/bin/env python3
from app.database import SessionLocal
from app.models.order import Order
from app.models.delivery_run import DeliveryRun

try:
    db = SessionLocal()
    order_count = db.query(Order).count()
    print(f"Database connection OK. Total orders: {order_count}")

    runs = db.query(DeliveryRun).all()
    print(f"Total delivery runs: {len(runs)}")
    for run in runs:
        print(f"  Run ID: {run.id}, Name: '{run.name}', Status: {run.status}")

    db.close()
except Exception as e:
    print(f"Database error: {e}")
