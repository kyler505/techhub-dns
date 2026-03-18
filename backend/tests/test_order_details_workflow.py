#!/usr/bin/env python3
"""Regression checks for order-details email workflow helpers."""

import sys
from datetime import date

sys.path.append(".")

from app.services.analytics_service import AnalyticsService
from app.services.order_service import OrderService


def test_append_order_details_sent_marker_for_existing_remarks():
    existing = "Deliver to ACAD 101"
    updated = OrderService._append_order_details_sent_marker(existing)

    assert updated == "Deliver to ACAD 101\n\nOrder Details Sent"
    print("[PASS] append marker adds two-line separator")


def test_append_order_details_sent_marker_is_idempotent():
    existing = "Deliver to ACAD 101\n\nOrder Details Sent"
    updated = OrderService._append_order_details_sent_marker(existing)

    assert updated is None
    print("[PASS] append marker does not duplicate existing marker")


def test_append_order_details_sent_marker_for_empty_remarks():
    updated = OrderService._append_order_details_sent_marker("")

    assert updated == "Order Details Sent"
    print("[PASS] append marker handles empty remarks")


def test_is_business_day_filters_weekends():
    assert AnalyticsService._is_business_day(date(2026, 3, 16)) is True
    assert AnalyticsService._is_business_day(date(2026, 3, 21)) is False
    assert AnalyticsService._is_business_day("2026-03-22") is False
    print("[PASS] business-day helper filters weekends")


if __name__ == "__main__":
    print("Running order-details workflow regression tests...")
    print()

    test_append_order_details_sent_marker_for_existing_remarks()
    test_append_order_details_sent_marker_is_idempotent()
    test_append_order_details_sent_marker_for_empty_remarks()
    test_is_business_day_filters_weekends()

    print()
    print("[SUCCESS] Order-details workflow regression tests passed!")
