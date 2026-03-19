import os
import sys
import base64
import hashlib
import hmac
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from flask import Flask

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from app.api.routes.inflow import bp as inflow_bp
from app.utils.webhook_security import verify_webhook_signature
from app.utils.exceptions import ValidationError


class _FakeQuery:
    def __init__(self, records=None):
        self._records = records or []

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._records

    def first(self):
        return None


class _FakeDb:
    def __init__(self, active_webhooks=None):
        self._active_webhooks = active_webhooks or []

    def query(self, *_args, **_kwargs):
        return _FakeQuery(self._active_webhooks)

    def commit(self):
        return None


@contextmanager
def _fake_get_db():
    yield _FakeDb()


def _fake_get_db_with_secrets(*secrets):
    @contextmanager
    def _context_manager():
        yield _FakeDb([SimpleNamespace(secret=secret) for secret in secrets if secret])

    return _context_manager


class _FakeInflowService:
    def verify_webhook_signature(self, payload, signature, secret):
        return verify_webhook_signature(payload, signature, secret)

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


def test_webhook_accepts_env_secret_when_db_secret_is_stale():
    app = _make_app()
    current_secret = "current-secret"
    stale_secret = "stale-secret"
    payload = b'{"orderNumber":"TH-123"}'
    signature = base64.b64encode(
        hmac.new(current_secret.encode("utf-8"), payload, hashlib.sha256).digest()
    ).decode("ascii")

    class _SuccessfulOrderService:
        def __init__(self, _db):
            pass

        def create_order_from_inflow(self, _inflow_order):
            return SimpleNamespace(id="order-1")

    with app.test_client() as client:
        with (
            patch(
                "app.api.routes.inflow.get_db", _fake_get_db_with_secrets(stale_secret)
            ),
            patch("app.api.routes.inflow.InflowService", _FakeInflowService),
            patch("app.api.routes.inflow.OrderService", _SuccessfulOrderService),
            patch(
                "app.api.routes.inflow.settings.inflow_webhook_secret", current_secret
            ),
            patch("app.api.routes.inflow.threading.Thread") as mock_thread,
        ):
            response = client.post(
                "/api/inflow/webhook",
                data=payload,
                headers={"x-inflow-hmac-sha256": signature},
                content_type="application/json",
            )

    mock_thread.assert_called_once()
    assert response.status_code == 200
    assert response.get_json() == {
        "order_id": "order-1",
        "status": "processed",
    }


def test_verify_webhook_signature_accepts_base64url_whsec_secret():
    payload = b'{"orderNumber":"TH-4515"}'
    secret_bytes = b"techhub-webhook-secret"
    secret = "whsec_" + base64.urlsafe_b64encode(secret_bytes).decode("ascii").rstrip(
        "="
    )
    signature = base64.b64encode(
        hmac.new(secret_bytes, payload, hashlib.sha256).digest()
    ).decode("ascii")

    assert verify_webhook_signature(payload, signature, secret) is True


if __name__ == "__main__":
    test_webhook_returns_500_on_processing_error()
    test_webhook_returns_validation_status_code()
    test_webhook_accepts_env_secret_when_db_secret_is_stale()
    test_verify_webhook_signature_accepts_base64url_whsec_secret()
    print("[PASS] inflow webhook route tests passed")
