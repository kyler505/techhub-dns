#!/usr/bin/env python3
"""
Interactive script to scan and manually delete orders for testing purposes.

This script allows you to:
- View all orders in the database
- Filter orders by status, order number, or other criteria
- Selectively delete orders one by one or in bulk

Usage:
    # Activate virtual environment first (if using .venv in backend folder)
    cd backend
    .venv\Scripts\activate  # Windows
    # or
    source .venv/bin/activate  # Linux/Mac

    # Run the script
    python scripts/manage_orders.py

    # Filter by status
    python scripts/manage_orders.py --status PreDelivery

    # Filter by order number
    python scripts/manage_orders.py --order-number TH3270

    # Delete specific order by ID
    python scripts/manage_orders.py --delete-id <uuid>
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Optional
from uuid import UUID

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models.order import Order, OrderStatus
from app.models.audit_log import AuditLog
from app.models.teams_notification import TeamsNotification


def format_order(order: Order) -> str:
    """Format an order for display."""
    return (
        f"ID: {order.id}\n"
        f"  Order Number: {order.inflow_order_id}\n"
        f"  Status: {order.status.value}\n"
        f"  Recipient: {order.recipient_name or 'N/A'}\n"
        f"  Location: {order.delivery_location or 'N/A'}\n"
        f"  PO Number: {order.po_number or 'N/A'}\n"
        f"  Deliverer: {order.assigned_deliverer or 'N/A'}\n"
        f"  Created: {order.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"  Updated: {order.updated_at.strftime('%Y-%m-%d %H:%M:%S')}"
    )


def list_orders(
    status: Optional[str] = None,
    order_number: Optional[str] = None,
    limit: int = 100
) -> List[Order]:
    """List orders with optional filters."""
    db = SessionLocal()
    try:
        query = db.query(Order)

        if status:
            try:
                status_enum = OrderStatus(status)
                query = query.filter(Order.status == status_enum)
            except ValueError:
                print(f"Warning: Invalid status '{status}'. Valid statuses: {[s.value for s in OrderStatus]}")

        if order_number:
            query = query.filter(Order.inflow_order_id.ilike(f"%{order_number}%"))

        query = query.order_by(Order.created_at.desc()).limit(limit)
        orders = query.all()
        return orders
    finally:
        db.close()


def delete_order(order_id: UUID, confirm: bool = True) -> bool:
    """Delete an order and its related data."""
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()

        if not order:
            print(f"Order with ID {order_id} not found.")
            return False

        if confirm:
            print("\n" + "="*60)
            print("ORDER TO DELETE:")
            print("="*60)
            print(format_order(order))
            print("="*60)

            response = input("\nAre you sure you want to delete this order? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Deletion cancelled.")
                return False

        # Delete related data (cascade should handle this, but being explicit)
        db.query(TeamsNotification).filter(TeamsNotification.order_id == order_id).delete()
        db.query(AuditLog).filter(AuditLog.order_id == order_id).delete()

        # Delete the order
        db.delete(order)
        db.commit()

        print(f"\n✓ Order {order.inflow_order_id} (ID: {order_id}) deleted successfully.")
        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error deleting order: {e}")
        return False
    finally:
        db.close()


def interactive_mode():
    """Interactive mode for browsing and deleting orders."""
    db = SessionLocal()
    try:
        while True:
            print("\n" + "="*60)
            print("ORDER MANAGEMENT")
            print("="*60)
            print("1. List all orders")
            print("2. List orders by status")
            print("3. Search orders by order number")
            print("4. Delete order by ID")
            print("5. Delete order by order number")
            print("6. Show order statistics")
            print("7. Exit")
            print("="*60)

            choice = input("\nSelect an option (1-7): ").strip()

            if choice == "1":
                orders = list_orders()
                if not orders:
                    print("\nNo orders found.")
                else:
                    print(f"\nFound {len(orders)} orders:\n")
                    for i, order in enumerate(orders, 1):
                        print(f"{i}. {format_order(order)}\n")

            elif choice == "2":
                print("\nAvailable statuses:")
                for status in OrderStatus:
                    print(f"  - {status.value}")
                status_input = input("\nEnter status (or press Enter for all): ").strip()
                orders = list_orders(status=status_input if status_input else None)
                if not orders:
                    print("\nNo orders found.")
                else:
                    print(f"\nFound {len(orders)} orders:\n")
                    for i, order in enumerate(orders, 1):
                        print(f"{i}. {format_order(order)}\n")

            elif choice == "3":
                order_number = input("\nEnter order number (partial match): ").strip()
                if order_number:
                    orders = list_orders(order_number=order_number)
                    if not orders:
                        print("\nNo orders found.")
                    else:
                        print(f"\nFound {len(orders)} orders:\n")
                        for i, order in enumerate(orders, 1):
                            print(f"{i}. {format_order(order)}\n")
                else:
                    print("Order number cannot be empty.")

            elif choice == "4":
                order_id_str = input("\nEnter order ID (UUID): ").strip()
                try:
                    order_id = UUID(order_id_str)
                    delete_order(order_id)
                except ValueError:
                    print("Invalid UUID format.")

            elif choice == "5":
                order_number = input("\nEnter order number: ").strip()
                if order_number:
                    orders = list_orders(order_number=order_number)
                    if not orders:
                        print(f"\nNo orders found with order number '{order_number}'.")
                    elif len(orders) == 1:
                        delete_order(orders[0].id)
                    else:
                        print(f"\nFound {len(orders)} orders with that number:")
                        for i, order in enumerate(orders, 1):
                            print(f"{i}. {format_order(order)}\n")
                        selection = input("Enter number to delete (or 'cancel'): ").strip()
                        try:
                            idx = int(selection) - 1
                            if 0 <= idx < len(orders):
                                delete_order(orders[idx].id)
                            else:
                                print("Invalid selection.")
                        except ValueError:
                            if selection.lower() != 'cancel':
                                print("Invalid input.")
                else:
                    print("Order number cannot be empty.")

            elif choice == "6":
                total = db.query(Order).count()
                by_status = {}
                for status in OrderStatus:
                    count = db.query(Order).filter(Order.status == status).count()
                    by_status[status.value] = count

                print("\n" + "="*60)
                print("ORDER STATISTICS")
                print("="*60)
                print(f"Total Orders: {total}")
                print("\nBy Status:")
                for status, count in by_status.items():
                    print(f"  {status}: {count}")
                print("="*60)

            elif choice == "7":
                print("\nExiting...")
                break

            else:
                print("\nInvalid option. Please select 1-7.")

    finally:
        db.close()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Interactive script to scan and manually delete orders for testing"
    )
    parser.add_argument(
        "--status",
        type=str,
        help="Filter orders by status (PreDelivery, InDelivery, Delivered, Issue)"
    )
    parser.add_argument(
        "--order-number",
        type=str,
        help="Filter orders by order number (partial match)"
    )
    parser.add_argument(
        "--delete-id",
        type=str,
        help="Delete order by UUID (non-interactive)"
    )
    parser.add_argument(
        "--delete-order-number",
        type=str,
        help="Delete order by order number (non-interactive)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of orders to display (default: 100)"
    )
    parser.add_argument(
        "--no-confirm",
        action="store_true",
        help="Skip confirmation prompt when deleting"
    )

    args = parser.parse_args()

    # Non-interactive delete by ID
    if args.delete_id:
        try:
            order_id = UUID(args.delete_id)
            delete_order(order_id, confirm=not args.no_confirm)
        except ValueError:
            print(f"Error: '{args.delete_id}' is not a valid UUID.")
        return

    # Non-interactive delete by order number
    if args.delete_order_number:
        orders = list_orders(order_number=args.delete_order_number)
        if not orders:
            print(f"No orders found with order number '{args.delete_order_number}'.")
        elif len(orders) == 1:
            delete_order(orders[0].id, confirm=not args.no_confirm)
        else:
            print(f"Error: Found {len(orders)} orders with that number. Use --delete-id to specify exact order.")
        return

    # List mode (non-interactive)
    if args.status or args.order_number:
        orders = list_orders(status=args.status, order_number=args.order_number, limit=args.limit)
        if not orders:
            print("No orders found matching the criteria.")
        else:
            print(f"\nFound {len(orders)} orders:\n")
            for i, order in enumerate(orders, 1):
                print(f"{i}. {format_order(order)}\n")
        return

    # Interactive mode
    interactive_mode()


if __name__ == "__main__":
    main()
