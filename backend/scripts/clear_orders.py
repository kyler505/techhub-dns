"""
Script to clear all orders and related data from the database.

This script deletes all orders, audit logs, and Teams notifications
while preserving the Teams webhook configuration.

Usage:
    # Activate virtual environment first (if using .venv in backend folder)
    cd backend
    .venv\Scripts\activate  # Windows
    # or
    source .venv/bin/activate  # Linux/Mac

    # Run the script
    python scripts/clear_orders.py
"""

import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models.order import Order
from app.models.audit_log import AuditLog
from app.models.teams_notification import TeamsNotification

def clear_orders():
    """Clear all orders and related data from the database."""
    db = SessionLocal()
    try:
        print("Clearing orders and related data...")

        # Delete in order (respecting foreign key constraints)
        notifications_count = db.query(TeamsNotification).count()
        audit_logs_count = db.query(AuditLog).count()
        orders_count = db.query(Order).count()

        print(f"  Found {notifications_count} Teams notifications")
        print(f"  Found {audit_logs_count} audit logs")
        print(f"  Found {orders_count} orders")

        # Delete in order (respecting foreign key constraints)
        deleted_notifications = db.query(TeamsNotification).delete()
        deleted_audit_logs = db.query(AuditLog).delete()
        deleted_orders = db.query(Order).delete()

        db.commit()

        print(f"\n✓ Deleted {deleted_notifications} Teams notifications")
        print(f"✓ Deleted {deleted_audit_logs} audit logs")
        print(f"✓ Deleted {deleted_orders} orders")
        print("\nAll orders and related data cleared successfully!")

    except Exception as e:
        db.rollback()
        print(f"\n✗ Error clearing orders: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    clear_orders()
