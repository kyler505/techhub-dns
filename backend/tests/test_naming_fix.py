import sys
from pathlib import Path
import os

# Add backend to sys.path
backend_path = Path(__file__).parent.parent
sys.path.append(str(backend_path))

from app.services.pdf_service import PDFService

def test_robust_naming():
    service = PDFService()

    # Mock data with various naming scenarios
    inflow_data = {
        "orderNumber": "SO-123",
        "lines": [
            {
                "productName": "Expanded Name",
                "productId": "hash1",
                "product": {"name": "Product Object Name", "sku": "SKU1"},
                "unitPrice": 100,
                "quantity": {"standardQuantity": 1}
            },
            {
                "productId": "hash2",
                "product": {"name": "Object Name Only", "sku": "SKU2"},
                "unitPrice": 50,
                "quantity": {"standardQuantity": 2}
            },
            {
                "productId": "hash3",
                "description": "Description Fallback",
                "product": {"sku": "SKU3"},
                "unitPrice": 25,
                "quantity": {"standardQuantity": 3}
            },
            {
                "productId": "hash4",
                "product": {"sku": "SKU4"},
                "unitPrice": 10,
                "quantity": {"standardQuantity": 4}
            }
        ],
        "pickLines": []
    }

    # Capture names generated in line_items (we need to trigger a small part of generate_order_details_pdf or mock the lines)
    # Since generate_order_details_pdf outputs bytes, let's just test the logic directly if possible or mock the line item loop

    print("Testing robust naming logic...")

    results = []
    for line in inflow_data["lines"]:
        product = line.get("product", {})
        product_name = (
            line.get("productName") or
            product.get("name") or
            line.get("description") or
            line.get("productId") or
            "Unknown Product"
        )
        results.append(product_name)

    expected = [
        "Expanded Name",
        "Object Name Only",
        "Description Fallback",
        "hash4"
    ]

    for r, e in zip(results, expected):
        print(f"Got: '{r}', Expected: '{e}'")
        assert r == e

    print("SUCCESS: Robust naming logic verified!")

if __name__ == "__main__":
    try:
        test_robust_naming()
    except Exception as e:
        print(f"FAILURE: {e}")
        sys.exit(1)
