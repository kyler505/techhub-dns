#!/usr/bin/env python3
"""Focused tests for multi-leg partial-order behavior."""

import asyncio
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch


backend_path = Path(__file__).parent.parent
sys.path.append(str(backend_path))

from app.services.inflow_service import InflowService
from app.services.order_service import OrderService


def test_fulfill_sales_order_appends_new_partial_shipment_lines():
    """A later partial-delivery leg should append new pack/ship lines in InFlow."""

    order_payload = {
        "salesOrderId": "sales-order-3",
        "orderNumber": "TH1003",
        "customerId": "customer-1",
        "lines": [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": "2"},
            }
        ],
        "pickLines": [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": "2"},
            }
        ],
        "packLines": [
            {
                "salesOrderPackLineId": "pack-1",
                "productId": "prod-1",
                "description": "Laptop",
                "containerNumber": "DELIVERY-TH1003-1",
                "quantity": {"standardQuantity": "1"},
            }
        ],
        "shipLines": [
            {
                "salesOrderShipLineId": "ship-1",
                "carrier": "TechHub",
                "containers": ["DELIVERY-TH1003-1"],
                "shippedDate": "2026-03-23T12:00:00Z",
            }
        ],
    }

    recorded: dict[str, Any] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {"items": [recorded["payload"]]}

    class FakeAsyncClient:
        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def put(
            self, url: str, json: dict[str, Any], headers: dict[str, str]
        ) -> FakeResponse:
            recorded["url"] = url
            recorded["payload"] = json
            recorded["headers"] = headers
            return FakeResponse()

    service = InflowService()
    service._headers = {
        "Authorization": "Bearer test",
        "Content-Type": "application/json",
    }

    with patch.object(
        service, "get_order_by_id", AsyncMock(return_value=order_payload)
    ):
        with patch("app.services.inflow_service.httpx.AsyncClient", FakeAsyncClient):
            result = asyncio.run(
                service.fulfill_sales_order("sales-order-3", only_picked_items=True)
            )

    assert len(result["packLines"]) == 2
    assert result["packLines"][1]["containerNumber"] == "DELIVERY-TH1003-2"
    assert result["packLines"][1]["quantity"]["standardQuantity"] == "1.0"
    assert len(result["shipLines"]) == 2
    assert result["shipLines"][1]["containers"] == ["DELIVERY-TH1003-2"]
    print("[PASS] InFlow fulfillment appends a second partial-delivery shipment")


def test_asset_tag_serials_only_include_unshipped_remaining_items():
    """Asset-tag prep should only expose serials for the remaining leg."""

    service = InflowService()
    order_payload = {
        "lines": [
            {
                "productId": "prod-asset",
                "product": {"name": "Laptop", "category": {"name": "Laptops Dell"}},
                "unitPrice": 1200,
                "quantity": {
                    "standardQuantity": "2",
                    "serialNumbers": ["SN-1", "SN-2"],
                },
            }
        ],
        "pickLines": [
            {
                "productId": "prod-asset",
                "product": {"name": "Laptop", "category": {"name": "Laptops Dell"}},
                "unitPrice": 1200,
                "quantity": {
                    "standardQuantity": "2",
                    "serialNumbers": ["SN-1", "SN-2"],
                },
            }
        ],
        "packLines": [
            {
                "productId": "prod-asset",
                "quantity": {"standardQuantity": "1", "serialNumbers": ["SN-1"]},
            }
        ],
    }

    serials = service.get_asset_tag_serials(order_payload)

    assert len(serials) == 1
    assert serials[0]["serials"] == ["SN-2"]
    print("[PASS] Asset-tag serials only include unshipped remaining devices")


def test_partial_order_details_regenerate_instead_of_reusing_sharepoint_pdf():
    """Second-leg order details should be regenerated from remaining items."""

    class FakeSharePointService:
        is_enabled = True

        def __init__(self) -> None:
            self.download_called = False

        def download_file(self, subfolder: str, filename: str) -> bytes | None:
            self.download_called = True
            return b"stale-pdf"

        def upload_file(self, content: bytes, subfolder: str, filename: str) -> str:
            return f"sharepoint://{subfolder}/{filename}"

    fake_sp_service = FakeSharePointService()
    generated_payloads: list[dict[str, Any]] = []

    order = SimpleNamespace(
        id="order-4",
        inflow_order_id="TH1004",
        recipient_contact="user@example.com",
        recipient_name="User",
        inflow_data={
            "orderNumber": "TH1004",
            "lines": [
                {
                    "productId": "prod-asset",
                    "description": "Laptop",
                    "unitPrice": 1200,
                    "quantity": {
                        "standardQuantity": "2",
                        "serialNumbers": ["SN-1", "SN-2"],
                    },
                }
            ],
            "pickLines": [
                {
                    "productId": "prod-asset",
                    "description": "Laptop",
                    "unitPrice": 1200,
                    "quantity": {
                        "standardQuantity": "2",
                        "serialNumbers": ["SN-1", "SN-2"],
                    },
                }
            ],
            "packLines": [
                {
                    "productId": "prod-asset",
                    "quantity": {"standardQuantity": "1", "serialNumbers": ["SN-1"]},
                }
            ],
        },
        order_details_path=None,
        order_details_generated_at=None,
    )

    db = SimpleNamespace(commit=lambda: None, refresh=lambda _order: None)
    service = OrderService(db=cast(Any, db))

    with tempfile.TemporaryDirectory() as tmpdir:
        service._storage_path = lambda *parts: Path(tmpdir).joinpath(*parts)  # type: ignore[method-assign]

        with patch(
            "app.services.sharepoint_service.get_sharepoint_service",
            return_value=fake_sp_service,
        ):
            with patch(
                "app.services.pdf_service.pdf_service.generate_order_details_pdf",
                side_effect=lambda payload: (
                    generated_payloads.append(payload) or b"fresh-pdf"
                ),
            ):
                with patch(
                    "app.services.email_service.email_service.is_configured",
                    return_value=False,
                ):
                    success = service._send_order_details_email(order)

    assert success is False
    assert fake_sp_service.download_called is False
    assert len(generated_payloads) == 1
    assert generated_payloads[0]["lines"][0]["quantity"]["standardQuantity"] == "1"
    assert generated_payloads[0]["pickLines"][0]["quantity"]["serialNumbers"] == [
        "SN-2"
    ]
    assert order.order_details_path == "sharepoint://order-details/TH1004.pdf"
    assert order.order_details_generated_at is not None
    print("[PASS] Partial order details regenerate from remaining items")


if __name__ == "__main__":
    print("Running partial-order workflow tests...")
    print()

    test_fulfill_sales_order_appends_new_partial_shipment_lines()
    test_asset_tag_serials_only_include_unshipped_remaining_items()
    test_partial_order_details_regenerate_instead_of_reusing_sharepoint_pdf()

    print()
    print("[SUCCESS] All partial-order workflow tests passed!")
