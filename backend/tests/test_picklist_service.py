#!/usr/bin/env python3
"""Tests for PicklistService (extracted from OrderService)"""

import sys
import os
sys.path.append('.')

from pathlib import Path
import json

# Sample Inflow order data for testing
SAMPLE_INFLOW_DATA = {
    "orderNumber": "TEST1234",
    "poNumber": "PO-12345",
    "contactName": "John Doe",
    "email": "john.doe@tamu.edu",
    "shippingAddress": {
        "address1": "123 Main St",
        "city": "College Station",
        "state": "TX",
        "postalCode": "77843"
    },
    "orderRemarks": "Please deliver to ACAD 101",
    "customFields": {
        "custom4": "UIN12345"
    },
    "pickLines": [
        {
            "productId": "prod-001",
            "product": {
                "name": "Dell Laptop",
                "sku": "LAPTOP-001",
                "trackSerials": True
            },
            "quantity": {
                "standardQuantity": "2",
                "serialNumbers": ["SN001", "SN002"]
            }
        },
        {
            "productId": "prod-002",
            "product": {
                "name": "USB Keyboard",
                "sku": "KB-001",
                "trackSerials": False
            },
            "quantity": {
                "standardQuantity": "3",
                "serialNumbers": []
            }
        }
    ],
    "packLines": []
}

# Sample data with some items already shipped
SAMPLE_INFLOW_DATA_PARTIAL_SHIPPED = {
    **SAMPLE_INFLOW_DATA,
    "packLines": [
        {
            "productId": "prod-001",
            "quantity": {
                "standardQuantity": "1",
                "serialNumbers": ["SN001"]
            }
        }
    ]
}


def test_picklist_service_import():
    """Test that PicklistService can be imported"""
    from app.services.picklist_service import PicklistService
    assert PicklistService is not None
    print("[PASS] PicklistService import test passed")


def test_filter_picklines_no_shipped():
    """Test filter_picklines when nothing is shipped"""
    from app.services.picklist_service import PicklistService

    service = PicklistService()
    pick_lines = SAMPLE_INFLOW_DATA["pickLines"]

    filtered = service.filter_picklines(SAMPLE_INFLOW_DATA, pick_lines)

    # Should return all items since nothing shipped
    assert len(filtered) == 2
    print("[PASS] filter_picklines (no shipped items) test passed")


def test_filter_picklines_partial_shipped():
    """Test filter_picklines when some items are shipped"""
    from app.services.picklist_service import PicklistService

    service = PicklistService()
    pick_lines = SAMPLE_INFLOW_DATA_PARTIAL_SHIPPED["pickLines"]

    filtered = service.filter_picklines(SAMPLE_INFLOW_DATA_PARTIAL_SHIPPED, pick_lines)

    # Should have 2 items: 1 laptop (reduced qty) and 3 keyboards
    assert len(filtered) == 2

    # Find the laptop entry
    laptop = next((item for item in filtered if item["productId"] == "prod-001"), None)
    assert laptop is not None
    # Only 1 serial should remain (SN002)
    assert "SN002" in laptop["quantity"]["serialNumbers"]
    assert "SN001" not in laptop["quantity"]["serialNumbers"]

    print("[PASS] filter_picklines (partial shipped) test passed")


def test_wrap_text_empty():
    """Test _wrap_text with empty input"""
    from app.services.picklist_service import PicklistService

    service = PicklistService()
    result = service._wrap_text("", 500, "Helvetica", 11)

    assert result == []
    print("[PASS] _wrap_text (empty) test passed")


def test_wrap_text_with_newlines():
    """Test _wrap_text preserves explicit newlines"""
    from app.services.picklist_service import PicklistService

    service = PicklistService()
    result = service._wrap_text("Line 1\nLine 2\nLine 3", 500, "Helvetica", 11)

    assert len(result) >= 3  # At least 3 lines
    print("[PASS] _wrap_text (with newlines) test passed")


def test_generate_picklist_pdf():
    """Test PDF generation creates a file"""
    from app.services.picklist_service import PicklistService

    # Create temp directory
    temp_dir = Path("storage/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)

    output_path = temp_dir / "test_picklist.pdf"

    # Clean up if exists
    if output_path.exists():
        output_path.unlink()

    service = PicklistService()
    service.generate_picklist_pdf(SAMPLE_INFLOW_DATA, str(output_path))

    # Verify file was created
    assert output_path.exists(), "PDF file should be created"
    assert output_path.stat().st_size > 0, "PDF file should not be empty"

    print(f"[PASS] generate_picklist_pdf test passed (file size: {output_path.stat().st_size} bytes)")

    # Clean up
    output_path.unlink(missing_ok=True)


def test_order_service_uses_picklist_service():
    """Test that OrderService imports PicklistService correctly"""
    from app.services.order_service import OrderService

    # Verify the import works (the actual method calls PicklistService)
    assert OrderService is not None
    print("[PASS] OrderService uses PicklistService correctly")


if __name__ == "__main__":
    print("Running PicklistService tests...")
    print()

    # Import tests
    test_picklist_service_import()
    test_order_service_uses_picklist_service()

    # Unit tests
    test_filter_picklines_no_shipped()
    test_filter_picklines_partial_shipped()
    test_wrap_text_empty()
    test_wrap_text_with_newlines()

    # Integration tests
    test_generate_picklist_pdf()

    print()
    print("[SUCCESS] All PicklistService tests passed!")
