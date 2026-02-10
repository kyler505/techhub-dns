#!/usr/bin/env python3
"""Scriptable regression tests for vehicle checkout gating."""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path


def _set_test_db_url(db_path: Path) -> None:
    # Settings are loaded at import time, so this must happen before any app imports.
    abs_path = db_path.resolve()
    os.environ["DATABASE_URL"] = f"sqlite:///{abs_path.as_posix()}"


def _reset_schema(db_path: Path) -> None:
    from app.database import Base, engine
    from app import models  # noqa: F401  # ensure models are registered

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _create_pre_delivery_orders(db, count: int) -> list[str]:
    from app.models.order import Order, OrderStatus

    now = datetime.utcnow()
    orders: list[Order] = []
    for i in range(count):
        orders.append(
            Order(
                inflow_order_id=f"TEST-{i+1}",
                status=OrderStatus.PRE_DELIVERY.value,
                created_at=now,
                updated_at=now,
            )
        )
    db.add_all(orders)
    db.commit()
    return [o.id for o in orders]


def test_vehicle_checkout_flow() -> None:
    from app.database import SessionLocal
    from app.services.delivery_run_service import DeliveryRunService
    from app.services.vehicle_checkout_service import VehicleCheckoutService
    from app.models.delivery_run import DeliveryRunStatus
    from app.utils.exceptions import ValidationError

    db = SessionLocal()
    try:
        order_ids = _create_pre_delivery_orders(db, count=2)

        checkout_svc = VehicleCheckoutService(db)

        # Checkout van by Alice.
        checkout = checkout_svc.checkout(vehicle="van", checked_out_by="Alice", purpose="Delivery")
        assert checkout.vehicle == "van"
        assert checkout.checked_out_by == "Alice"
        assert checkout.checked_in_at is None
        print("[PASS] checkout van by Alice")

        # Cannot checkout van again by Bob.
        try:
            checkout_svc.checkout(vehicle="van", checked_out_by="Bob", purpose="Delivery")
            raise AssertionError("Expected ValidationError for duplicate checkout")
        except ValidationError as exc:
            assert "already checked out" in exc.message.lower()
        print("[PASS] cannot checkout van by Bob while active")

        run_svc = DeliveryRunService(db)

        # Cannot create delivery run for van by Bob (mismatch).
        try:
            run_svc.create_run(runner="Bob", order_ids=order_ids, vehicle="van")
            raise AssertionError("Expected ValidationError for runner mismatch")
        except ValidationError as exc:
            assert exc.field == "runner"
            assert "different user" in exc.message.lower()
        print("[PASS] cannot create run for van by Bob (mismatch)")

        # Can create delivery run for van by Alice.
        run = run_svc.create_run(runner="Alice", order_ids=order_ids, vehicle="van")
        assert run.vehicle == "van"
        assert run.status == "Active"
        print("[PASS] can create run for van by Alice")

        # Checkin should be blocked while active run exists.
        try:
            checkout_svc.checkin(vehicle="van", checked_in_by="Alice")
            raise AssertionError("Expected ValidationError for checkin during active run")
        except ValidationError as exc:
            assert "active" in exc.message.lower()
        print("[PASS] cannot check in van while active run")

        # Simulate run completion and allow checkin.
        run.status = DeliveryRunStatus.COMPLETED.value
        run.end_time = datetime.utcnow()
        db.commit()

        checked_in = checkout_svc.checkin(vehicle="van", checked_in_by="Alice", notes="Returned")
        assert checked_in.checked_in_at is not None
        print("[PASS] checkin van after run completion")

        # Status endpoint backing service returns consistent statuses.
        statuses = checkout_svc.get_vehicle_statuses()
        van = next((s for s in statuses if s["vehicle"] == "van"), None)
        assert van is not None
        assert van["checked_out"] is False
        assert van["delivery_run_active"] is False
        print("[PASS] get_vehicle_statuses reflects checkin + completed run")
    finally:
        db.close()


if __name__ == "__main__":
    print("Running vehicle checkout tests...\n")

    sys.path.append(".")

    tmp_db = Path("tests/.tmp_vehicle_checkout.db")
    tmp_db.parent.mkdir(parents=True, exist_ok=True)
    if tmp_db.exists():
        tmp_db.unlink(missing_ok=True)

    _set_test_db_url(tmp_db)
    _reset_schema(tmp_db)
    test_vehicle_checkout_flow()

    # Ensure SQLite file can be removed on Windows.
    from app.database import engine

    engine.dispose()
    tmp_db.unlink(missing_ok=True)
    print("\n[SUCCESS] All vehicle checkout tests passed!")
