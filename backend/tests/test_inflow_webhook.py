import os
import sys
from contextlib import contextmanager
from unittest.mock import patch

from flask import Flask

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from app.api.routes.inflow import bp as inflow_bp
from app.utils.exceptions import ValidationError


class _FakeQuery:
    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return []

    def first(self):
        return None


class _FakeDb:
    def query(self, *_args, **_kwargs):
        return _FakeQuery()

    def commit(self):
        return None


@contextmanager
def _fake_get_db():
    yield _FakeDb()


class _FakeInflowService:
    def get_order_by_number_sync(self, order_number):
        return {"orderNumber": order_number, "pickLines": [{"id": "line-1"}]}

    def get_order_by_id_sync(self, sales_order_id):
        return {
            "orderNumber": f"ORDER-{sales_order_id}",
            "pickLines": [{"id": "line-1"}],
        }

    def is_started_and_picked(self, _order):
        return True


def _make_app():
    app = Flask(__name__)
    app.register_blueprint(inflow_bp, url_prefix="/api/inflow")
    return app


def test_webhook_returns_500_on_processing_error():
    app = _make_app()

    class _FailingOrderService:
        def __init__(self, _db):
            pass

        def create_order_from_inflow(self, _inflow_order):
            raise RuntimeError("database write failed")

    with app.test_client() as client:
        with (
            patch("app.api.routes.inflow.get_db", _fake_get_db),
            patch("app.api.routes.inflow.InflowService", _FakeInflowService),
            patch("app.api.routes.inflow.OrderService", _FailingOrderService),
        ):
            response = client.post(
                "/api/inflow/webhook", json={"orderNumber": "TH-123"}
            )

    assert response.status_code == 500
    assert response.get_json() == {
        "status": "error",
        "message": "database write failed",
    }


def test_webhook_returns_validation_status_code():
    app = _make_app()

    class _RejectingOrderService:
        def __init__(self, _db):
            pass

        def create_order_from_inflow(self, _inflow_order):
            raise ValidationError("Order number is required", field="orderNumber")

    with app.test_client() as client:
        with (
            patch("app.api.routes.inflow.get_db", _fake_get_db),
            patch("app.api.routes.inflow.InflowService", _FakeInflowService),
            patch("app.api.routes.inflow.OrderService", _RejectingOrderService),
        ):
            response = client.post(
                "/api/inflow/webhook", json={"orderNumber": "TH-123"}
            )

    assert response.status_code == 400
    assert response.get_json() == {
        "status": "error",
        "message": "Order number is required",
        "code": "VALIDATION_ERROR",
    }


if __name__ == "__main__":
    test_webhook_returns_500_on_processing_error()
    test_webhook_returns_validation_status_code()
    print("[PASS] inflow webhook route tests passed")
