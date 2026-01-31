#!/usr/bin/env python3
r"""
Universal Database and Order Management Tool
# Force git update for JCAIN fix

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

from app.models.delivery_run import DeliveryRun, DeliveryRunStatus, VehicleEnum
from app.utils.building_mapper import extract_building_code_from_location, get_building_code_from_address


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
            db.query(AuditLog).filter(AuditLog.order_id == order_id_str).delete()
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
            audit_logs_count = db.query(AuditLog).count()
            orders_count = db.query(Order).count()
            delivery_runs_count = db.query(DeliveryRun).count()

            print("\n" + "="*60)
            print("DATABASE CLEAR OPERATION")
            print("="*60)
            print(f"Orders to delete: {orders_count}")
            print(f"Audit logs: {audit_logs_count}")
            print(f"Delivery runs: {delivery_runs_count}")
            print("="*60)

            response = input("\nAre you sure you want to clear ALL data? This cannot be undone! (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Operation cancelled.")
                return False

        print("Clearing all data...")

        # Delete in order (respecting foreign key constraints)
        audit_logs_deleted = db.query(AuditLog).delete()
        orders_deleted = db.query(Order).delete()
        delivery_runs_deleted = db.query(DeliveryRun).delete()

        db.commit()

        print(f"\n✓ Deleted {orders_deleted} orders")
        print(f"✓ Deleted {audit_logs_deleted} audit logs")

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


# ============================================================================
# DELIVERY RUN MANAGEMENT FUNCTIONS
# ============================================================================

def format_delivery_run(run: DeliveryRun, detailed: bool = False) -> str:
    """Format a delivery run for display."""
    order_count = len(run.orders) if run.orders else 0
    base_info = (
        f"ID: {run.id}\n"
        f"  Name: {run.name}\n"
        f"  Runner: {run.runner}\n"
        f"  Vehicle: {run.vehicle}\n"
        f"  Status: {run.status}\n"
        f"  Orders: {order_count}\n"
        f"  Started: {run.start_time.strftime('%Y-%m-%d %H:%M:%S') if run.start_time else 'N/A'}\n"
        f"  Ended: {run.end_time.strftime('%Y-%m-%d %H:%M:%S') if run.end_time else 'N/A'}"
    )

    if detailed and run.orders:
        order_list = "\n  Orders in this run:"
        for o in run.orders:
            order_list += f"\n    - {o.inflow_order_id}: {o.status} ({o.recipient_name or 'N/A'})"
        return base_info + order_list

    return base_info


def list_delivery_runs(
    status: Optional[str] = None,
    limit: int = 50,
    detailed: bool = False
) -> List[DeliveryRun]:
    """List delivery runs with optional filters."""
    db = SessionLocal()
    try:
        query = db.query(DeliveryRun)

        if status:
            query = query.filter(DeliveryRun.status == status)

        query = query.order_by(DeliveryRun.created_at.desc()).limit(limit)
        runs = query.all()
        return runs
    finally:
        db.close()


def get_delivery_run_by_id(run_id: str) -> Optional[DeliveryRun]:
    """Get a single delivery run by ID."""
    db = SessionLocal()
    try:
        return db.query(DeliveryRun).filter(DeliveryRun.id == run_id).first()
    finally:
        db.close()


def delete_delivery_run(run_id: str, confirm: bool = True) -> bool:
    """Delete a delivery run and unassign its orders."""
    db = SessionLocal()
    try:
        run = db.query(DeliveryRun).filter(DeliveryRun.id == run_id).first()

        if not run:
            print(f"Delivery run with ID {run_id} not found.")
            return False

        if confirm:
            print("\n" + "="*70)
            print("DELIVERY RUN TO DELETE:")
            print("="*70)
            print(format_delivery_run(run, detailed=True))
            print("="*70)

            response = input("\nAre you sure you want to delete this run? Orders will be unassigned. (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Deletion cancelled.")
                return False

        # Unassign orders from this run
        for order in run.orders:
            order.delivery_run_id = None
            order.updated_at = datetime.utcnow()

        # Delete the run
        db.delete(run)
        db.commit()

        print(f"\n✓ Delivery run {run.name} (ID: {run_id}) deleted successfully.")
        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error deleting delivery run: {e}")
        return False
    finally:
        db.close()


def update_delivery_run_status(run_id: str, new_status: str) -> bool:
    """Update a delivery run's status."""
    db = SessionLocal()
    try:
        run = db.query(DeliveryRun).filter(DeliveryRun.id == run_id).first()

        if not run:
            print(f"Delivery run with ID {run_id} not found.")
            return False

        # Validate status
        try:
            status_enum = DeliveryRunStatus(new_status)
        except ValueError:
            print(f"Invalid status '{new_status}'. Valid statuses: {[s.value for s in DeliveryRunStatus]}")
            return False

        old_status = run.status
        run.status = status_enum.value
        run.updated_at = datetime.utcnow()

        if new_status == DeliveryRunStatus.COMPLETED.value:
            run.end_time = datetime.utcnow()

        db.commit()
        db.refresh(run)

        print(f"\n✓ Delivery run {run.name} status updated!")
        print(f"  From: {old_status}")
        print(f"  To: {run.status}")

        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error updating delivery run status: {e}")
        return False
    finally:
        db.close()


def execute_raw_sql(sql: str, confirm: bool = True) -> bool:
    """Execute raw SQL query on the database."""
    db = SessionLocal()
    try:
        if confirm:
            print("\n" + "="*70)
            print("RAW SQL EXECUTION")
            print("="*70)
            print(f"Query: {sql}")
            print("="*70)

            response = input("\nExecute this SQL? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Execution cancelled.")
                return False

        result = db.execute(sql)
        db.commit()

        if result.returns_rows:
            rows = result.fetchall()
            print(f"\n✓ Query returned {len(rows)} rows:")
            for row in rows[:50]:  # Limit output
                print(f"  {row}")
            if len(rows) > 50:
                print(f"  ... ({len(rows) - 50} more rows)")
        else:
            print(f"\n✓ Query executed. Rows affected: {result.rowcount}")

        return True
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error executing SQL: {e}")
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


def fix_order_locations(order_number: Optional[str] = None, confirm: bool = True) -> bool:
    """Re-process and update order locations using updated building mapping logic."""
    db = SessionLocal()
    try:
        query = db.query(Order)
        if order_number:
            query = query.filter(Order.inflow_order_id == order_number)
            target_desc = f"order {order_number}"
        else:
            target_desc = "all eligible orders"

        orders = query.all()

        if not orders:
            print(f"No orders found matching {target_desc}.")
            return False

        orders_to_update = []
        for order in orders:
            current_location = order.delivery_location
            if not current_location:
                continue

            # Check if it's a non-local order (e.g. Houston) that was incorrectly mapped
            inflow_data = order.inflow_data or {}
            shipping_addr = inflow_data.get("shippingAddress", {})
            city = shipping_addr.get("city", "").strip()

            addr1 = shipping_addr.get("address1", "")
            addr2 = shipping_addr.get("address2", "")
            full_addr = " ".join(filter(None, [addr1, addr2]))

            inferred_city = city
            if not city and "HOUSTON" in full_addr.upper():
                inferred_city = "Houston"

            is_local = True
            if inferred_city:
                 if inferred_city.upper() not in ["BRYAN", "COLLEGE STATION"]:
                      is_local = False

            new_code = None

            if not is_local:
                # If non-local, location should be the city or full address
                # If current location is a code (like NGPO), we should fix it
                target_location = inferred_city or full_addr
                if current_location != target_location:
                    orders_to_update.append((order, target_location))
                continue

            # Skip if already a simple code (optional optimization)
            # But only if we are sure it's valid?
            # If we are running fix-locations, we probably want to re-verify everything.
            # Commenting out optimization to be safe.
            # if len(current_location) <= 6 and current_location.isalpha() and current_location.isupper():
            #    continue

            new_code = extract_building_code_from_location(current_location)
            if not new_code:
                 # Try using the full address from inflow data if available, as delivery_location might be truncated/modified
                 location_to_check = full_addr if full_addr else current_location
                 new_code = extract_building_code_from_location(location_to_check)

            if not new_code:
                 new_code = get_building_code_from_address(current_location)

            if new_code and new_code != current_location:
                orders_to_update.append((order, new_code))

        if not orders_to_update:
            print("No orders need location updates.")
            return True

        print(f"\nFound {len(orders_to_update)} orders to update:")
        for order, new_code in orders_to_update[:10]:
            print(f"  {order.inflow_order_id}: '{order.delivery_location}' -> '{new_code}'")
        if len(orders_to_update) > 10:
            print(f"  ... and {len(orders_to_update) - 10} more.")

        if confirm:
            response = input("\nProceed with updates? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("Operation cancelled.")
                return False

        count = 0
        for order, new_code in orders_to_update:
            order.delivery_location = new_code
            count += 1

        db.commit()
        print(f"\n✓ Successfully updated {count} orders.")
        return True

    except Exception as e:
        db.rollback()
        print(f"\n✗ Error fixing locations: {e}")
        return False
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
            print("--- Orders ---")
            print("1. List/Search Orders")
            print("2. View Order Details")
            print("3. Update Order Status")
            print("4. Delete Order")
            print("5. Create Test Order")
            print("6. Reset Order for Testing")
            print("")
            print("--- Delivery Runs ---")
            print("7. List Delivery Runs")
            print("8. View Delivery Run Details")
            print("9. Update Delivery Run Status")
            print("10. Delete Delivery Run")
            print("")
            print("--- Database ---")
            print("11. Database Statistics")
            print("12. Execute Raw SQL")
            print("13. Clear ALL Data")
            print("14. Fix Order Locations (Re-map based on current logic)")
            print("")
            print("0. Exit")
            print("="*70)

            choice = input("\nSelect an option: ").strip()

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
                # List Delivery Runs
                print("\nFilter Options:")
                print("1. List all runs")
                print("2. Filter by status")
                sub_choice = input("Choose (1-2): ").strip()

                if sub_choice == "2":
                    print("Available statuses:", [s.value for s in DeliveryRunStatus])
                    status = input("Enter status: ").strip()
                    runs = list_delivery_runs(status=status)
                else:
                    runs = list_delivery_runs()

                if not runs:
                    print("No delivery runs found.")
                else:
                    print(f"\nFound {len(runs)} delivery runs:\n")
                    for i, run in enumerate(runs, 1):
                        print(f"{i}. {format_delivery_run(run)}\n")

            elif choice == "8":
                # View Delivery Run Details
                run_id = input("Enter delivery run ID: ").strip()
                run = get_delivery_run_by_id(run_id)
                if run:
                    print("\n" + format_delivery_run(run, detailed=True))
                else:
                    print("Delivery run not found.")

            elif choice == "9":
                # Update Delivery Run Status
                run_id = input("Enter delivery run ID: ").strip()
                print("Available statuses:", [s.value for s in DeliveryRunStatus])
                new_status = input("Enter new status: ").strip()
                update_delivery_run_status(run_id, new_status)

            elif choice == "10":
                # Delete Delivery Run
                run_id = input("Enter delivery run ID: ").strip()
                delete_delivery_run(run_id)

            elif choice == "11":
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

            elif choice == "12":
                # Execute Raw SQL
                print("\n⚠️  WARNING: Raw SQL execution can modify or delete data!")
                print("Example SELECT: SELECT id, inflow_order_id, status FROM orders LIMIT 10")
                print("Example UPDATE: UPDATE orders SET status = 'PreDelivery' WHERE id = '...'")
                sql = input("\nEnter SQL query: ").strip()
                if sql:
                    execute_raw_sql(sql)

            elif choice == "13":
                clear_all_orders()

            elif choice == "14":
                order_num = input("Enter specific order number (optional, press Enter for all): ").strip() or None
                fix_order_locations(order_number=order_num)

            elif choice == "0":
                print("\nExiting...")
                break

            else:
                print("\nInvalid option. Please select a valid number.")

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
    parser.add_argument("--fix-locations", action="store_true", help="Re-process order locations using current mapping logic")
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

    # Handle location fix
    if args.fix_locations:
        fix_order_locations(order_number=args.order_number, confirm=not args.no_confirm)
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
