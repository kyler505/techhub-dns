import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Setup path and environment
backend_path = Path(__file__).parent.parent
sys.path.append(str(backend_path))
load_dotenv(backend_path / ".env")

from app.services.inflow_service import InflowService

def main():
    service = InflowService()
    target_order_number = "TH130"
    print(f"Fetching order {target_order_number}...")

    # Fetch TH130 directly
    orders = service.fetch_orders_sync(order_number=target_order_number, count=1)

    target_order = None
    if orders:
        target_order = orders[0]

    if not target_order:
        print(f"Order {target_order_number} not found.")
        return

    sales_order_id = target_order.get("salesOrderId")
    print(f"Found {target_order_number}. Internal ID: {sales_order_id}")

    # Now fetch the full order detail as the PDF route would
    print("Fetching full order details...")
    full_order = service.get_order_by_id_sync(sales_order_id)

    if not full_order:
        print("Failed to fetch full order details.")
        return

    print("\n--- LINE ITEMS ---")
    lines = full_order.get("lines", [])
    for i, line in enumerate(lines):
        print(f"\nItem {i+1}:")
        print(json.dumps(line, indent=2))

        # Test my fallback logic manually here
        product = line.get("product", {})
        product_name = (
            line.get("productName") or
            product.get("name") or
            line.get("description") or
            line.get("productId") or
            "Unknown Product"
        )
        print(f"Resolves to: '{product_name}'")

if __name__ == "__main__":
    main()
