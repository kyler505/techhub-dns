#!/usr/bin/env python3
"""Check Order TH3970 status"""

import sys
import os
sys.path.append('..')

from app.database import SessionLocal
from app.models.order import Order, OrderStatus
from datetime import datetime

db = SessionLocal()
try:
    order = db.query(Order).filter(Order.inflow_order_id == 'TH3970').first()
    if order:
        print(f'Order ID: {order.id}')
        print(f'Order Number: {order.inflow_order_id}')
        print(f'Status: {order.status}')
        print(f'Recipient: {order.recipient_name}')
        print(f'Location: {order.delivery_location}')
        print(f'Tagged At: {order.tagged_at}')
        print(f'Picklist Generated: {order.picklist_generated_at}')
        print(f'QA Completed: {order.qa_completed_at}')
        print(f'Signature Captured: {order.signature_captured_at}')
        print(f'Picklist Path: {order.picklist_path}')
        print(f'QA Path: {order.qa_path}')
        print(f'Signed Picklist Path: {order.signed_picklist_path}')
        print(f'Delivery Run ID: {order.delivery_run_id}')
        print(f'Assigned Deliverer: {order.assigned_deliverer}')
    else:
        print('Order TH3970 not found')
finally:
    db.close()
