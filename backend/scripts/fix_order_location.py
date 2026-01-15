
import sys
import os
import logging
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

# Add parent directory to path to allow importing app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.order import Order
from app.utils.building_mapper import extract_building_code_from_location, get_building_code_from_address

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_order_locations(order_number=None):
    db = SessionLocal()
    try:
        query = db.query(Order)
        if order_number:
            query = query.filter(Order.inflow_order_id == order_number)
        else:
            # If no specific order, only look at orders that don't have a simple 3-5 letter location code
            # ensuring we don't overwrite valid existing ones unnecessarily, though the mapper is safe
            pass

        orders = query.all()
        logger.info(f"Found {len(orders)} orders to check")

        count_updated = 0
        for order in orders:
            current_location = order.delivery_location

            # Skip if no location
            if not current_location:
                continue

            # Skip if location is already a simple building code (e.g. "JCAIN")
            if len(current_location) <= 6 and current_location.isalpha() and current_location.isupper():
                continue

            logger.info(f"Checking Order {order.inflow_order_id}: Current Location = '{current_location}'")

            # Try to extract code using the updated mapper
            new_code = extract_building_code_from_location(current_location)

            # If not found via simple extraction, try full address matching logic if available
            # (matches logic in order_service.py)
            if not new_code:
                 new_code = get_building_code_from_address(current_location)

            if new_code and new_code != current_location:
                logger.info(f"  -> Found match! Updating to '{new_code}'")
                order.delivery_location = new_code
                count_updated += 1
            else:
                logger.info(f"  -> No better mapping found.")

        if count_updated > 0:
            db.commit()
            logger.info(f"Successfully updated {count_updated} orders")
        else:
            logger.info("No orders needed updating")

    except Exception as e:
        logger.error(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_order = sys.argv[1]
        fix_order_locations(target_order)
    else:
        print("Usage: python scripts/fix_order_location.py <OrderNumber>")
        print("Example: python scripts/fix_order_location.py TH4056")
