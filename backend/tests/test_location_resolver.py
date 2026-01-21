#!/usr/bin/env python3
"""Tests for LocationResolverService (extracted from OrderService)"""

import sys
sys.path.append('.')


# Sample Inflow order data for testing
SAMPLE_LOCAL_ORDER = {
    "orderNumber": "TEST1234",
    "orderRemarks": "Please deliver to LAAH 424",
    "shippingAddress": {
        "address1": "123 Main St",
        "address2": "Room 100",
        "city": "College Station",
        "state": "TX",
        "postalCode": "77843"
    }
}

SAMPLE_SHIPPING_ORDER = {
    "orderNumber": "TEST5678",
    "orderRemarks": "",
    "shippingAddress": {
        "address1": "456 Oak Ave",
        "city": "Houston",
        "state": "TX",
        "postalCode": "77001"
    }
}

SAMPLE_NO_CITY_ORDER = {
    "orderNumber": "TEST9999",
    "orderRemarks": "",
    "shippingAddress": {
        "address1": "789 Elm St",
        "city": "",  # No city
    }
}


def test_location_resolver_import():
    """Test that LocationResolverService can be imported"""
    from app.services.location_resolver_service import LocationResolverService, ResolvedLocation
    assert LocationResolverService is not None
    assert ResolvedLocation is not None
    print("[PASS] LocationResolverService import test passed")


def test_resolved_location_dataclass():
    """Test ResolvedLocation dataclass"""
    from app.services.location_resolver_service import ResolvedLocation

    resolved = ResolvedLocation(
        building_code="LAAH",
        display_location="LAAH 424",
        source="remarks",
        is_local_delivery=True
    )

    assert resolved.building_code == "LAAH"
    assert resolved.display_location == "LAAH 424"
    assert resolved.source == "remarks"
    assert resolved.is_local_delivery == True
    print("[PASS] ResolvedLocation dataclass test passed")


def test_local_delivery_detection():
    """Test that College Station orders are detected as local"""
    from app.services.location_resolver_service import LocationResolverService

    service = LocationResolverService()
    resolved = service.resolve_location(SAMPLE_LOCAL_ORDER)

    assert resolved.is_local_delivery == True, f"Expected local delivery, got is_local_delivery={resolved.is_local_delivery}"
    print("[PASS] Local delivery detection test passed")


def test_shipping_order_detection():
    """Test that Houston orders are detected as shipping"""
    from app.services.location_resolver_service import LocationResolverService

    service = LocationResolverService()
    resolved = service.resolve_location(SAMPLE_SHIPPING_ORDER)

    assert resolved.is_local_delivery == False, f"Expected shipping order, got is_local_delivery={resolved.is_local_delivery}"
    assert resolved.display_location == "Houston"
    print("[PASS] Shipping order detection test passed")


def test_extract_location_from_remarks():
    """Test _extract_delivery_location_from_remarks"""
    from app.services.location_resolver_service import LocationResolverService

    service = LocationResolverService()

    # Test "deliver to" pattern
    result = service._extract_delivery_location_from_remarks("Please deliver to LAAH 424")
    assert result is not None
    assert "laah" in result.lower() or "424" in result

    # Test empty remarks
    result_empty = service._extract_delivery_location_from_remarks("")
    assert result_empty is None

    # Test None-like remarks
    result_none = service._extract_delivery_location_from_remarks(None)
    assert result_none is None

    print("[PASS] Extract location from remarks test passed")


def test_no_city_assumes_local():
    """Test that orders without a city are assumed local"""
    from app.services.location_resolver_service import LocationResolverService

    service = LocationResolverService()
    resolved = service.resolve_location(SAMPLE_NO_CITY_ORDER)

    assert resolved.is_local_delivery == True, "Orders without city should default to local"
    print("[PASS] No city assumes local test passed")


def test_combine_addresses():
    """Test _combine_addresses helper"""
    from app.services.location_resolver_service import LocationResolverService

    service = LocationResolverService()

    # Test with both addresses
    result = service._combine_addresses("123 Main St", "Suite 100")
    assert result == "123 Main St Suite 100"

    # Test with only address1
    result = service._combine_addresses("123 Main St", "")
    assert result == "123 Main St"

    # Test with empty both
    result = service._combine_addresses("", "")
    assert result == ""

    print("[PASS] Combine addresses test passed")


if __name__ == "__main__":
    print("Running LocationResolverService tests...")
    print()

    # Import tests
    test_location_resolver_import()
    test_resolved_location_dataclass()

    # Unit tests
    test_combine_addresses()
    test_extract_location_from_remarks()

    # Integration tests
    test_local_delivery_detection()
    test_shipping_order_detection()
    test_no_city_assumes_local()

    print()
    print("[SUCCESS] All LocationResolverService tests passed!")
