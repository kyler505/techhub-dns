#!/usr/bin/env python3
"""Reset Order TH3970 to test document bundling"""

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
        print(f'Resetting Order {order.inflow_order_id} for bundling test...')

        # Reset status back to InDelivery
        order.status = OrderStatus.IN_DELIVERY.value

        # Clear signature-related fields
        order.signature_captured_at = None
        order.signed_picklist_path = None

        # Keep all the prep work (tagging, picklist, QA) so we can test signing
        # Don't reset: tagged_at, picklist_generated_at, qa_completed_at, picklist_path, qa_path

        db.commit()
        db.refresh(order)

        print(f'[SUCCESS] Order status reset to: {order.status}')
        print(f'[SUCCESS] Signature captured at: {order.signature_captured_at}')
        print(f'[SUCCESS] Signed picklist path: {order.signed_picklist_path}')
        print()
        print('Order is now ready for signing with document bundling!')
        print('All prep work (tagging, picklist, QA) is still completed.')

    else:
        print('Order TH3970 not found')
finally:
    db.close()
