#!/usr/bin/env python3
"""
Universal Database and Order Management Tool

This script provides comprehensive database and order management capabilities:
- Create, edit, delete, and search orders
- Bulk operations and database maintenance
- Order status management and validation
- Testing utilities and order reset functions

Usage:
    # Activate virtual environment first (if using .venv in backend folder)
    cd backend
    .venv\Scripts\activate  # Windows
    # or
    source .venv/bin/activate  # Linux/Mac

    # Run the script
    python scripts/database_manager.py

    # Direct commands (non-interactive)
    python scripts/database_manager.py --list --status PreDelivery
    python scripts/database_manager.py --search TH3970
    python scripts/database_manager.py --clear-all
    python scripts/database_manager.py --reset TH3970
    python scripts/database_manager.py --create --order-number TH9999 --recipient "Test User"
"""

import sys
import argparse
import json
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models.order import Order, OrderStatus
from app.models.audit_log import AuditLog
from app.models.teams_notification import TeamsNotification
from app.models.delivery_run import DeliveryRun


def format_order(order: Order, detailed: bool = False) -> str:
    """Format an order for display."""
    base_info = (
        f"ID: {order.id}\n"
        f"  Order Number: {order.inflow_order_id}\n"
        f"  Status: {order.status}\n"
        f"  Recipient: {order.recipient_name or 'N/A'}\n"
        f"  Location: {order.delivery_location or 'N/A'}\n"
        f"  PO Number: {order.po_number or 'N/A'}\n"
        f"  Created: {order.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"  Updated: {order.updated_at.strftime('%Y-%m-%d %H:%M:%S')}"
    )

    if detailed:
        detailed_info = (
            f"  Deliverer: {order.assigned_deliverer or 'N/A'}\n"
            f"  Tagged At: {order.tagged_at.strftime('%Y-%m-%d %H:%M:%S') if order.tagged_at else 'N/A'}\n"
            f"  Picklist Generated: {order.picklist_generated_at.strftime('%Y-%m-%d %H:%M:%S') if order.picklist_generated_at else 'N/A'}\n"
            f"  QA Completed: {order.qa_completed_at.strftime('%Y-%m-%d %H:%M:%S') if order.qa_completed_at else 'N/A'}\n"
            f"  Signature Captured: {order.signature_captured_at.strftime('%Y-%m-%d %H:%M:%S') if order.signature_captured_at else 'N/A'}\n"
            f"  Delivery Run ID: {order.delivery_run_id or 'N/A'}\n"
            f"  Shipping Status: {order.shipping_workflow_status or 'N/A'}"
        )
        return base_info + "\n" + detailed_info

    return base_info


def list_orders(
    status: Optional[str] = None,
    order_number: Optional[str] = None,
    limit: int = 50,
    detailed: bool = False
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


def get_order_by_id(order_id: UUID) -> Optional[Order]:
    """Get a single order by ID."""
    db = SessionLocal()
    try:
        order_id_str = str(order_id)
        return db.query(Order).filter(Order.id == order_id_str).first()
    finally:
        db.close()


def get_order_by_number(order_number: str) -> Optional[Order]:
    """Get a single order by order number."""
    db = SessionLocal()
    try:
        return db.query(Order).filter(Order.inflow_order_id == order_number).first()
    finally:
        db.close()


def delete_order(order_id: UUID, confirm: bool = True, cascade: bool = True) -> bool:
    """Delete an order and optionally its related data."""
    db = SessionLocal()
    try:
        order_id_str = str(order_id)
        order = db.query(Order).filter(Order.id == order_id_str).first()

        if not order:
            print(f"Order with ID {order_id} not found.")
            return False

        if confirm:
            print("\n" + "="*70)
            print("ORDER TO DELETE:")
            print("="*70)
            print(format_order(order, detailed=True))
            print("="*70)

            response = input("\nAre you sure you want to delete this order? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Deletion cancelled.")
                return False

        # Delete related data if cascade is enabled
        if cascade:
            db.query(TeamsNotification).filter(TeamsNotification.order_id == order_id_str).delete()
            db.query(AuditLog).filter(AuditLog.order_id == order_id_str).delete()

        # Delete the order
        db.delete(order)
        db.commit()

        print(f"\n✓ Order {order.inflow_order_id} (ID: {order_id}) deleted successfully.")
        if cascade:
            print("  Related audit logs and notifications also deleted.")
        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error deleting order: {e}")
        return False
    finally:
        db.close()


def clear_all_orders(confirm: bool = True) -> bool:
    """Clear all orders and related data from the database."""
    db = SessionLocal()
    try:
        if confirm:
            # Get counts
            notifications_count = db.query(TeamsNotification).count()
            audit_logs_count = db.query(AuditLog).count()
            orders_count = db.query(Order).count()
            delivery_runs_count = db.query(DeliveryRun).count()

            print("\n" + "="*60)
            print("DATABASE CLEAR OPERATION")
            print("="*60)
            print(f"Orders to delete: {orders_count}")
            print(f"Teams notifications: {notifications_count}")
            print(f"Audit logs: {audit_logs_count}")
            print(f"Delivery runs: {delivery_runs_count}")
            print("="*60)

            response = input("\nAre you sure you want to clear ALL data? This cannot be undone! (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Operation cancelled.")
                return False

        print("Clearing all data...")

        # Delete in order (respecting foreign key constraints)
        notifications_deleted = db.query(TeamsNotification).delete()
        audit_logs_deleted = db.query(AuditLog).delete()
        orders_deleted = db.query(Order).delete()
        delivery_runs_deleted = db.query(DeliveryRun).delete()

        db.commit()

        print(f"\n✓ Deleted {orders_deleted} orders")
        print(f"✓ Deleted {audit_logs_deleted} audit logs")
        print(f"✓ Deleted {notifications_deleted} Teams notifications")
        print(f"✓ Deleted {delivery_runs_deleted} delivery runs")
        print("\nAll data cleared successfully!")

        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error clearing database: {e}")
        raise
    finally:
        db.close()


def reset_order_for_testing(order_number: str, confirm: bool = True) -> bool:
    """Reset an order to a specific state for testing purposes."""
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.inflow_order_id == order_number).first()

        if not order:
            print(f"Order {order_number} not found.")
            return False

        if confirm:
            print("\n" + "="*70)
            print(f"RESET ORDER {order_number} FOR TESTING:")
            print("="*70)
            print("Current state:")
            print(format_order(order, detailed=True))
            print("\nWill reset to In Delivery status with signature fields cleared.")
            print("="*70)

            response = input("\nProceed with reset? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Reset cancelled.")
                return False

        # Reset status to In Delivery
        order.status = OrderStatus.IN_DELIVERY.value

        # Clear signature-related fields
        order.signature_captured_at = None
        order.signed_picklist_path = None

        # Keep all prep work (tagging, picklist, QA) for testing
        order.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(order)

        print(f"\n✓ Order {order_number} reset for testing!")
        print(f"  Status: {order.status}")
        print(f"  Signature captured: {order.signature_captured_at}")
        print(f"  Signed picklist: {order.signed_picklist_path}")
        print("  Prep work (tagging, picklist, QA) preserved.")

        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error resetting order: {e}")
        return False
    finally:
        db.close()


def create_test_order(order_number: str, recipient_name: str = "Test User",
                     location: str = "Test Location", po_number: Optional[str] = None) -> Optional[Order]:
    """Create a test order for development/testing purposes."""
    db = SessionLocal()
    try:
        # Check if order already exists
        existing = db.query(Order).filter(Order.inflow_order_id == order_number).first()
        if existing:
            print(f"Order {order_number} already exists.")
            return None

        # Create new order
        order = Order(
            inflow_order_id=order_number,
            recipient_name=recipient_name,
            delivery_location=location,
            po_number=po_number,
            status=OrderStatus.PICKED.value
        )

        db.add(order)
        db.commit()
        db.refresh(order)

        print(f"\n✓ Test order {order_number} created successfully!")
        print(format_order(order))

        return order
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error creating test order: {e}")
        return None
    finally:
        db.close()


def update_order_status(order_id: UUID, new_status: str, user_id: Optional[str] = None) -> bool:
    """Update an order's status with validation."""
    db = SessionLocal()
    try:
        order_id_str = str(order_id)
        order = db.query(Order).filter(Order.id == order_id_str).first()

        if not order:
            print(f"Order with ID {order_id} not found.")
            return False

        # Validate status
        try:
            status_enum = OrderStatus(new_status)
        except ValueError:
            print(f"Invalid status '{new_status}'. Valid statuses: {[s.value for s in OrderStatus]}")
            return False

        old_status = order.status
        order.status = status_enum.value
        order.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(order)

        print(f"\n✓ Order {order.inflow_order_id} status updated!")
        print(f"  From: {old_status}")
        print(f"  To: {order.status}")

        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error updating order status: {e}")
        return False
    finally:
        db.close()


def get_database_stats() -> Dict[str, Any]:
    """Get comprehensive database statistics."""
    db = SessionLocal()
    try:
        stats = {}

        # Order counts by status
        status_counts = {}
        for status in OrderStatus:
            count = db.query(Order).filter(Order.status == status).count()
            status_counts[status.value] = count

        stats['orders_by_status'] = status_counts
        stats['total_orders'] = sum(status_counts.values())

        # Other entity counts
        stats['delivery_runs'] = db.query(DeliveryRun).count()
        stats['audit_logs'] = db.query(AuditLog).count()
        stats['teams_notifications'] = db.query(TeamsNotification).count()

        # Recent activity
        recent_orders = db.query(Order).order_by(Order.created_at.desc()).limit(5).all()
        stats['recent_orders'] = [
            {
                'id': str(o.id),
                'order_number': o.inflow_order_id,
                'status': o.status,
                'created': o.created_at.isoformat()
            } for o in recent_orders
        ]

        return stats
    finally:
        db.close()


def interactive_mode():
    """Interactive mode for comprehensive database management."""
    db = SessionLocal()
    try:
        while True:
            print("\n" + "="*70)
            print("UNIVERSAL DATABASE & ORDER MANAGER")
            print("="*70)
            print("1. List/Search Orders")
            print("2. View Order Details")
            print("3. Update Order Status")
            print("4. Delete Order")
            print("5. Create Test Order")
            print("6. Reset Order for Testing")
            print("7. Database Statistics")
            print("8. Clear All Data")
            print("9. Exit")
            print("="*70)

            choice = input("\nSelect an option (1-9): ").strip()

            if choice == "1":
                print("\nSearch Options:")
                print("1. List all orders")
                print("2. Filter by status")
                print("3. Search by order number")
                sub_choice = input("Choose (1-3): ").strip()

                if sub_choice == "1":
                    orders = list_orders()
                elif sub_choice == "2":
                    print("Available statuses:", [s.value for s in OrderStatus])
                    status = input("Enter status: ").strip()
                    orders = list_orders(status=status)
                elif sub_choice == "3":
                    order_num = input("Enter order number (partial match): ").strip()
                    orders = list_orders(order_number=order_num)
                else:
                    continue

                if not orders:
                    print("No orders found.")
                else:
                    print(f"\nFound {len(orders)} orders:\n")
                    for i, order in enumerate(orders, 1):
                        print(f"{i}. {format_order(order)}\n")

            elif choice == "2":
                order_input = input("Enter order ID or order number: ").strip()
                order = None

                try:
                    # Try UUID first
                    order_id = UUID(order_input)
                    order = get_order_by_id(order_id)
                except ValueError:
                    # Try order number
                    order = get_order_by_number(order_input)

                if order:
                    print("\n" + format_order(order, detailed=True))
                else:
                    print("Order not found.")

            elif choice == "3":
                order_input = input("Enter order ID or order number: ").strip()
                print("Available statuses:", [s.value for s in OrderStatus])
                new_status = input("Enter new status: ").strip()

                try:
                    order_id = UUID(order_input)
                    update_order_status(order_id, new_status)
                except ValueError:
                    order = get_order_by_number(order_input)
                    if order:
                        update_order_status(order.id, new_status)
                    else:
                        print("Order not found.")

            elif choice == "4":
                order_input = input("Enter order ID or order number: ").strip()

                try:
                    order_id = UUID(order_input)
                    delete_order(order_id)
                except ValueError:
                    order = get_order_by_number(order_input)
                    if order:
                        delete_order(order.id)
                    else:
                        print("Order not found.")

            elif choice == "5":
                order_num = input("Order number (e.g., TH9999): ").strip()
                recipient = input("Recipient name: ").strip() or "Test User"
                location = input("Delivery location: ").strip() or "Test Location"
                po_num = input("PO number (optional): ").strip() or None

                create_test_order(order_num, recipient, location, po_num)

            elif choice == "6":
                order_num = input("Enter order number to reset: ").strip()
                reset_order_for_testing(order_num)

            elif choice == "7":
                stats = get_database_stats()
                print("\n" + "="*60)
                print("DATABASE STATISTICS")
                print("="*60)
                print(f"Total Orders: {stats['total_orders']}")
                print("\nOrders by Status:")
                for status, count in stats['orders_by_status'].items():
                    print(f"  {status}: {count}")

                print(f"\nOther Data:")
                print(f"  Delivery Runs: {stats['delivery_runs']}")
                print(f"  Audit Logs: {stats['audit_logs']}")
                print(f"  Teams Notifications: {stats['teams_notifications']}")

                print(f"\nRecent Orders ({len(stats['recent_orders'])}):")
                for order in stats['recent_orders']:
                    print(f"  {order['order_number']} - {order['status']} ({order['created'][:10]})")

            elif choice == "8":
                clear_all_orders()

            elif choice == "9":
                print("\nExiting...")
                break

            else:
                print("\nInvalid option. Please select 1-9.")

    finally:
        db.close()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Universal Database and Order Management Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/database_manager.py --list
  python scripts/database_manager.py --list --status PreDelivery
  python scripts/database_manager.py --search TH3970
  python scripts/database_manager.py --details TH3970
  python scripts/database_manager.py --delete TH3970
  python scripts/database_manager.py --create --order-number TH9999 --recipient "Test User"
  python scripts/database_manager.py --reset TH3970
  python scripts/database_manager.py --clear-all
  python scripts/database_manager.py --stats
        """
    )

    # Listing and searching
    parser.add_argument("--list", action="store_true", help="List orders")
    parser.add_argument("--status", type=str, help="Filter by status")
    parser.add_argument("--search", type=str, help="Search by order number (partial match)")
    parser.add_argument("--details", type=str, help="Show detailed info for specific order")

    # Modification operations
    parser.add_argument("--delete", type=str, help="Delete order by ID or order number")
    parser.add_argument("--update-status", nargs=2, metavar=('ORDER', 'STATUS'),
                       help="Update order status (e.g., --update-status TH3970 Delivered)")
    parser.add_argument("--create", action="store_true", help="Create a test order")
    parser.add_argument("--order-number", type=str, help="Order number for creation")
    parser.add_argument("--recipient", type=str, default="Test User", help="Recipient name for creation")
    parser.add_argument("--location", type=str, default="Test Location", help="Location for creation")
    parser.add_argument("--po-number", type=str, help="PO number for creation")

    # Maintenance operations
    parser.add_argument("--reset", type=str, help="Reset order for testing (by order number)")
    parser.add_argument("--clear-all", action="store_true", help="Clear all orders and related data")
    parser.add_argument("--stats", action="store_true", help="Show database statistics")

    # Utility options
    parser.add_argument("--limit", type=int, default=50, help="Limit for listing (default: 50)")
    parser.add_argument("--no-confirm", action="store_true", help="Skip confirmation prompts")
    parser.add_argument("--detailed", action="store_true", help="Show detailed order information")

    args = parser.parse_args()

    # If no arguments provided, enter interactive mode
    if len(sys.argv) == 1:
        interactive_mode()
        return

    # Handle list/search operations
    if args.list or args.status or args.search:
        orders = list_orders(
            status=args.status,
            order_number=args.search,
            limit=args.limit,
            detailed=args.detailed
        )

        if not orders:
            print("No orders found.")
        else:
            print(f"\nFound {len(orders)} orders:\n")
            for i, order in enumerate(orders, 1):
                print(f"{i}. {format_order(order, args.detailed)}\n")
        return

    # Handle details operation
    if args.details:
        order = None
        try:
            order_id = UUID(args.details)
            order = get_order_by_id(order_id)
        except ValueError:
            order = get_order_by_number(args.details)

        if order:
            print(format_order(order, detailed=True))
        else:
            print("Order not found.")
        return

    # Handle delete operation
    if args.delete:
        try:
            order_id = UUID(args.delete)
            delete_order(order_id, confirm=not args.no_confirm)
        except ValueError:
            order = get_order_by_number(args.delete)
            if order:
                delete_order(order.id, confirm=not args.no_confirm)
            else:
                print("Order not found.")
        return

    # Handle status update
    if args.update_status:
        order_input, new_status = args.update_status
        try:
            order_id = UUID(order_input)
            update_order_status(order_id, new_status)
        except ValueError:
            order = get_order_by_number(order_input)
            if order:
                update_order_status(order.id, new_status)
            else:
                print("Order not found.")
        return

    # Handle create operation
    if args.create:
        if not args.order_number:
            print("Error: --order-number is required when using --create")
            return
        create_test_order(
            args.order_number,
            args.recipient,
            args.location,
            args.po_number
        )
        return

    # Handle reset operation
    if args.reset:
        reset_order_for_testing(args.reset, confirm=not args.no_confirm)
        return

    # Handle clear operation
    if args.clear_all:
        clear_all_orders(confirm=not args.no_confirm)
        return

    # Handle stats operation
    if args.stats:
        stats = get_database_stats()
        print("\n" + "="*60)
        print("DATABASE STATISTICS")
        print("="*60)
        print(f"Total Orders: {stats['total_orders']}")
        print("\nOrders by Status:")
        for status, count in stats['orders_by_status'].items():
            print(f"  {status}: {count}")

        print(f"\nOther Data:")
        print(f"  Delivery Runs: {stats['delivery_runs']}")
        print(f"  Audit Logs: {stats['audit_logs']}")
        print(f"  Teams Notifications: {stats['teams_notifications']}")

        if stats['recent_orders']:
            print(f"\nRecent Orders ({len(stats['recent_orders'])}):")
            for order in stats['recent_orders']:
                print(f"  {order['order_number']} - {order['status']} ({order['created'][:10]})")
        return


if __name__ == "__main__":
    main()
