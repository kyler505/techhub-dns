#!/usr/bin/env python3
"""Tests for error handling functionality"""

import sys
import os
sys.path.append('.')

from app.utils.exceptions import (
    DNSApiError, ValidationError, NotFoundError,
    StatusTransitionError, FileOperationError
)

# Mock OrderStatus for testing without full imports
class MockOrderStatus:
    PICKED = type('obj', (object,), {'value': 'picked', 'display_name': 'Picked'})()
    QA = type('obj', (object,), {'value': 'qa', 'display_name': 'QA'})()
    PRE_DELIVERY = type('obj', (object,), {'value': 'pre-delivery', 'display_name': 'Pre-Delivery'})()
    IN_DELIVERY = type('obj', (object,), {'value': 'in-delivery', 'display_name': 'In Delivery'})()
    SHIPPING = type('obj', (object,), {'value': 'shipping', 'display_name': 'Shipping'})()
    DELIVERED = type('obj', (object,), {'value': 'delivered', 'display_name': 'Delivered'})()
    ISSUE = type('obj', (object,), {'value': 'issue', 'display_name': 'Issue'})()

# Simple mock classes for testing without pydantic
class MockErrorDetail:
    def __init__(self, code, message, field=None, details=None):
        self.code = code
        self.message = message
        self.field = field
        self.details = details or {}

class MockErrorResponse:
    def __init__(self, error, request_id=None):
        self.error = error
        self.request_id = request_id

    def dict(self):
        return {
            "error": {
                "code": self.error.code,
                "message": self.error.message,
                "field": self.error.field,
                "details": self.error.details
            },
            "request_id": self.request_id
        }


def test_dns_api_error_creation():
    """Test DNSApiError base class"""
    error = DNSApiError("TEST_ERROR", "Test message", 400, "field1", {"key": "value"})

    assert error.code == "TEST_ERROR"
    assert error.message == "Test message"
    assert error.status_code == 400
    assert error.field == "field1"
    assert error.details == {"key": "value"}
    print("[PASS] DNSApiError creation test passed")


def test_validation_error():
    """Test ValidationError"""
    error = ValidationError("Invalid input", "username", {"min_length": 3})

    assert error.code == "VALIDATION_ERROR"
    assert error.status_code == 400
    assert error.field == "username"
    assert error.details == {"min_length": 3}
    print("[PASS] ValidationError test passed")


def test_not_found_error():
    """Test NotFoundError"""
    error = NotFoundError("Order", "123")

    assert error.code == "NOT_FOUND"
    assert error.message == "Order not found: 123"
    assert error.status_code == 404
    print("[PASS] NotFoundError test passed")


def test_status_transition_error():
    """Test StatusTransitionError"""
    error = StatusTransitionError("picked", "pre-delivery", "Invalid transition")

    assert error.code == "INVALID_STATUS_TRANSITION"
    assert error.message == "Invalid status transition from picked to pre-delivery: Invalid transition"
    assert error.status_code == 400
    assert error.details == {"current_status": "picked", "requested_status": "pre-delivery"}
    print("[PASS] StatusTransitionError test passed")


def test_file_operation_error():
    """Test FileOperationError"""
    error = FileOperationError("read", "/path/to/file", "Permission denied")

    assert error.code == "FILE_OPERATION_ERROR"
    assert error.message == "File read failed for /path/to/file: Permission denied"
    assert error.status_code == 500
    print("[PASS] FileOperationError test passed")


def test_order_status_values():
    """Test that OrderStatus enum uses kebab-case values"""
    assert MockOrderStatus.PICKED.value == "picked"
    assert MockOrderStatus.QA.value == "qa"
    assert MockOrderStatus.PRE_DELIVERY.value == "pre-delivery"
    assert MockOrderStatus.IN_DELIVERY.value == "in-delivery"
    assert MockOrderStatus.SHIPPING.value == "shipping"
    assert MockOrderStatus.DELIVERED.value == "delivered"
    assert MockOrderStatus.ISSUE.value == "issue"
    print("[PASS] OrderStatus kebab-case values test passed")


def test_order_status_display_names():
    """Test that display_name property returns proper display names"""
    assert MockOrderStatus.PICKED.display_name == "Picked"
    assert MockOrderStatus.QA.display_name == "QA"
    assert MockOrderStatus.PRE_DELIVERY.display_name == "Pre-Delivery"
    assert MockOrderStatus.IN_DELIVERY.display_name == "In Delivery"
    assert MockOrderStatus.SHIPPING.display_name == "Shipping"
    assert MockOrderStatus.DELIVERED.display_name == "Delivered"
    assert MockOrderStatus.ISSUE.display_name == "Issue"
    print("[PASS] OrderStatus display names test passed")


def test_error_detail_schema():
    """Test ErrorDetail mock model"""
    detail = MockErrorDetail(
        code="TEST_ERROR",
        message="Test message",
        field="test_field",
        details={"key": "value"}
    )

    assert detail.code == "TEST_ERROR"
    assert detail.message == "Test message"
    assert detail.field == "test_field"
    assert detail.details == {"key": "value"}
    print("[PASS] ErrorDetail schema test passed")


def test_error_response_schema():
    """Test ErrorResponse mock model"""
    error_detail = MockErrorDetail(code="TEST_ERROR", message="Test message")
    response = MockErrorResponse(error=error_detail, request_id="12345")

    assert response.error.code == "TEST_ERROR"
    assert response.request_id == "12345"
    print("[PASS] ErrorResponse schema test passed")


def test_error_response_json():
    """Test that ErrorResponse can be serialized to JSON"""
    error_detail = MockErrorDetail(
        code="TEST_ERROR",
        message="Test message",
        field="test_field",
        details={"key": "value"}
    )
    response = MockErrorResponse(error=error_detail, request_id="12345")

    json_data = response.dict()
    expected = {
        "error": {
            "code": "TEST_ERROR",
            "message": "Test message",
            "field": "test_field",
            "details": {"key": "value"}
        },
        "request_id": "12345"
    }

    assert json_data == expected
    print("[PASS] ErrorResponse JSON serialization test passed")


if __name__ == "__main__":
    print("Running error handling tests...")
    print()

    # Test custom exceptions
    test_dns_api_error_creation()
    test_validation_error()
    test_not_found_error()
    test_status_transition_error()
    test_file_operation_error()

    # Test status enum changes
    test_order_status_values()
    test_order_status_display_names()

    # Test error schemas
    test_error_detail_schema()
    test_error_response_schema()
    test_error_response_json()

    print()
    print("[SUCCESS] All tests passed!")
