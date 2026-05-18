#!/usr/bin/env python3
"""Focused tests for multi-leg partial-order behavior."""

import asyncio
import os
import sys
import tempfile
import types
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


backend_path = Path(__file__).parent.parent
sys.path.append(str(backend_path))

from app.database import Base
from app.models.order import Order, OrderStatus
from app.services.inflow_service import InflowService
from app.services.order_splitting import OrderSplittingService


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
    from app.services.order_service import OrderService

    service = OrderService(db=cast(Any, db))

    with tempfile.TemporaryDirectory() as tmpdir:
        service._local_doc_path = lambda category, filename: Path(tmpdir) / category / filename  # type: ignore[method-assign]

        with patch(
            "app.services.sharepoint_service.get_sharepoint_service",
            return_value=fake_sp_service,
        ):
            fake_pdf_module = types.ModuleType("app.services.pdf_service")
            fake_pdf_module.pdf_service = SimpleNamespace(
                generate_order_details_pdf=lambda payload: (
                    generated_payloads.append(payload) or b"fresh-pdf"
                )
            )
            with patch.dict(
                sys.modules,
                {"app.services.pdf_service": fake_pdf_module},
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


def test_partial_order_details_raises_when_sharepoint_fails():
    """Order details generation should fail if required SharePoint upload is unavailable."""

    class FailingSharePointService:
        is_enabled = True

        def upload_file(self, content: bytes, subfolder: str, filename: str) -> str:
            raise RuntimeError("sharepoint unavailable")

    fake_sp_service = FailingSharePointService()
    generated_payloads: list[dict[str, Any]] = []

    order = SimpleNamespace(
        id="order-4b",
        inflow_order_id="TH1004-P",
        recipient_contact="user@example.com",
        recipient_name="User",
        inflow_sales_order_id="sales-order-1004",
        inflow_data={
            "orderNumber": "TH1004-P",
            "lines": [],
            "pickLines": [],
            "packLines": [],
            "orderRemarks": "",
        },
        order_details_path=None,
        order_details_generated_at=None,
    )

    db = SimpleNamespace(commit=lambda: None, refresh=lambda _order: None)
    from app.services.order_service import OrderService

    service = OrderService(db=cast(Any, db))

    with tempfile.TemporaryDirectory() as tmpdir:
        service._local_doc_path = lambda category, filename: Path(tmpdir) / category / filename  # type: ignore[method-assign]

        with patch(
            "app.services.sharepoint_service.get_sharepoint_service",
            return_value=fake_sp_service,
        ):
            fake_pdf_module = types.ModuleType("app.services.pdf_service")
            fake_pdf_module.pdf_service = SimpleNamespace(
                generate_order_details_pdf=lambda payload: (
                    generated_payloads.append(payload) or b"fresh-pdf"
                )
            )
            with patch.dict(
                sys.modules,
                {"app.services.pdf_service": fake_pdf_module},
            ):
                with patch(
                    "app.services.email_service.email_service.is_configured",
                    return_value=False,
                ):
                    try:
                        service._send_order_details_email(order)
                        raised = False
                    except RuntimeError as exc:
                        raised = True
                        assert "sharepoint unavailable" in str(exc)

        local_order_details_path = Path(tmpdir) / "orders" / "TH1004-P.pdf"
        assert local_order_details_path.exists()

    assert raised is True
    assert len(generated_payloads) == 1
    assert order.order_details_path is None
    assert order.order_details_generated_at is None
    print("[PASS] Partial order details fail when SharePoint upload fails")


def _make_sqlite_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_factory(), engine


def test_partial_picklist_leg_creation_links_parent_and_child():
    """Partial picklist splits should persist parent/child linkage without FK issues."""

    session, engine = _make_sqlite_session()
    session.execute(text("PRAGMA foreign_keys=ON"))

    original_order = Order(
        id="order-parent-2",
        inflow_order_id="TH2002",
        inflow_sales_order_id="sales-order-2002",
        recipient_name="User Two",
        recipient_contact="user.two@example.com",
        delivery_location="Building 202",
        po_number="PO-2002",
        status=OrderStatus.PICKED.value,
        inflow_data={
            "orderNumber": "TH2002",
            "lines": [
                {
                    "productId": "prod-1",
                    "description": "Laptop",
                    "quantity": {"standardQuantity": "2"},
                },
                {
                    "productId": "prod-2",
                    "description": "Dock",
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "description": "Laptop",
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "packLines": [
                {
                    "productId": "prod-1",
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "shipLines": [
                {
                    "containers": ["DELIVERY-TH2002-1"],
                }
            ],
        },
    )
    session.add(original_order)
    session.commit()

    try:
        service = OrderSplittingService(session)

        child_order = service.create_partial_picklist_leg(original_order, user_id="tech-2")

        assert child_order is not None
        assert child_order.inflow_order_id == "TH2002-P"
        assert child_order.parent_order_id == original_order.id
        assert original_order.has_remainder == "Y"
        assert original_order.remainder_order_id == child_order.id
        assert original_order.inflow_data["lines"] == [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": 1.0},
            },
            {
                "productId": "prod-2",
                "description": "Dock",
                "quantity": {"standardQuantity": 1.0},
            },
        ]
        assert original_order.inflow_data.get("pickLines") == []
        assert original_order.inflow_data.get("packLines") == []
        assert original_order.inflow_data.get("shipLines") == []
        assert child_order.inflow_data["lines"] == [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": "1.0"},
            }
        ]
        assert child_order.inflow_data["pickLines"] == [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": "1.0"},
            }
        ]
        assert child_order.inflow_data.get("packLines") == []
        assert child_order.inflow_data.get("shipLines") == []
        assert session.query(Order).filter(Order.inflow_order_id == "TH2002-P").count() == 1
    finally:
        session.close()
        engine.dispose()


def test_partial_order_remainder_creation_links_parent_and_child():
    """Partial picks should create a linked remainder order with only missing items."""

    session, engine = _make_sqlite_session()
    original_order = Order(
        id="order-parent-1",
        inflow_order_id="TH2001",
        inflow_sales_order_id="sales-order-2001",
        recipient_name="User One",
        recipient_contact="user.one@example.com",
        delivery_location="Building 101",
        po_number="PO-2001",
        status=OrderStatus.PICKED.value,
        inflow_data={
            "orderNumber": "TH2001",
            "lines": [
                {
                    "productId": "prod-1",
                    "description": "Laptop",
                    "quantity": {"standardQuantity": "2"},
                },
                {
                    "productId": "prod-2",
                    "description": "Dock",
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "description": "Laptop",
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "packLines": [
                {
                    "productId": "prod-1",
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "shipLines": [
                {
                    "containers": ["DELIVERY-TH2001-1"],
                }
            ],
        },
    )
    session.add(original_order)
    session.commit()

    try:
        service = OrderSplittingService(session)

        remainder_order = service.create_remainder_order(original_order, user_id="tech-1")

        assert remainder_order is not None
        assert remainder_order.inflow_order_id == "TH2001-R"
        assert remainder_order.inflow_sales_order_id == original_order.inflow_sales_order_id
        assert remainder_order.parent_order_id == original_order.id
        assert remainder_order.inflow_data["lines"] == [
            {
                "productId": "prod-1",
                "description": "Laptop",
                "quantity": {"standardQuantity": 1.0},
            },
            {
                "productId": "prod-2",
                "description": "Dock",
                "quantity": {"standardQuantity": 1.0},
            },
        ]
        assert remainder_order.inflow_data["pickLines"] == []
        assert remainder_order.inflow_data["packLines"] == []
        assert remainder_order.inflow_data["shipLines"] == []

        assert original_order.has_remainder == "Y"
        assert original_order.remainder_order_id == remainder_order.id
        assert session.query(Order).filter(Order.inflow_order_id == "TH2001-R").count() == 1
    finally:
        session.close()
        engine.dispose()


def test_generate_picklist_keeps_parent_active_when_partial_leg_already_exists():
    """Generating a partial picklist should not switch the active order to the child leg."""

    session, engine = _make_sqlite_session()
    session.execute(text("PRAGMA foreign_keys=ON"))

    parent_order = Order(
        id="order-parent-3",
        inflow_order_id="TH3001",
        inflow_sales_order_id="sales-order-3001",
        recipient_name="User Three",
        recipient_contact="user.three@example.com",
        delivery_location="Building 303",
        po_number="PO-3001",
        status=OrderStatus.PICKED.value,
        tagged_by="tech@example.com",
        inflow_data={
            "orderNumber": "TH3001",
            "contactName": "User Three",
            "email": "user.three@example.com",
            "shippingAddress": {"address1": "303 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                },
                {
                    "productId": "prod-2",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [],
        },
    )
    partial_leg = Order(
        id="order-child-3",
        inflow_order_id="TH3001-P",
        inflow_sales_order_id="sales-order-3001",
        recipient_name="User Three",
        recipient_contact="user.three@example.com",
        delivery_location="Building 303",
        po_number="PO-3001",
        status=OrderStatus.PICKED.value,
        parent_order_id=parent_order.id,
        inflow_data={
            "orderNumber": "TH3001-P",
            "contactName": "User Three",
            "email": "user.three@example.com",
            "shippingAddress": {"address1": "303 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
        },
    )
    session.add(parent_order)
    session.commit()

    session.add(partial_leg)
    session.commit()

    parent_order.has_remainder = "Y"
    parent_order.remainder_order_id = partial_leg.id
    session.commit()

    from app.services.order_service import OrderService

    service = OrderService(session)

    class FakeSharePointService:
        is_enabled = True

        def upload_pdf(self, pdf_path: str, subfolder: str, filename: str) -> str:
            return f"sharepoint://{subfolder}/{filename}"

    def fake_generate_picklist_pdf(self, inflow_data, output_path):
        Path(output_path).write_bytes(b"%PDF-1.4 fake picklist\n")

    with tempfile.TemporaryDirectory() as tmpdir:
        service._local_doc_path = lambda category, filename: Path(tmpdir) / category / filename  # type: ignore[method-assign]

        with patch("app.services.sharepoint_service.get_sharepoint_service", return_value=FakeSharePointService()):
            with patch(
                "app.services.picklist_service.PicklistService.generate_picklist_pdf",
                new=fake_generate_picklist_pdf,
            ):
                with patch(
                    "app.services.order_service.SystemSettingService.is_setting_enabled",
                    return_value=False,
                ):
                    with patch(
                        "app.services.order_service.SystemSettingService.get_setting",
                        return_value="false",
                    ):
                        with patch.object(service, "_send_order_details_email", return_value=True):
                            result = service.generate_picklist(
                                parent_order.id,
                                generated_by="tech@example.com",
                                generated_by_display="tech@example.com",
                                create_partial_leg=True,
                            )

    assert result.id == parent_order.id
    assert result.inflow_order_id == "TH3001"
    assert parent_order.picklist_path is not None
    assert partial_leg.picklist_path is None

    session.close()
    engine.dispose()


def test_generate_picklist_uses_parent_remainder_items_when_child_leg_exists():
    """Parent remainder docs should print only the remaining lines, not the original sales order."""

    session, engine = _make_sqlite_session()
    parent_order = Order(
        id="order-parent-4",
        inflow_order_id="TH3002",
        inflow_sales_order_id="sales-order-3002",
        recipient_name="User Four",
        recipient_contact="user.four@example.com",
        delivery_location="Building 404",
        po_number="PO-3002",
        status=OrderStatus.PICKED.value,
        tagged_by="tech@example.com",
        inflow_data={
            "orderNumber": "TH3002",
            "contactName": "User Four",
            "email": "user.four@example.com",
            "shippingAddress": {"address1": "404 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                },
                {
                    "productId": "prod-2",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [],
        },
    )
    child_order = Order(
        id="order-child-4",
        inflow_order_id="TH3002-P",
        inflow_sales_order_id="sales-order-3002",
        recipient_name="User Four",
        recipient_contact="user.four@example.com",
        delivery_location="Building 404",
        po_number="PO-3002",
        status=OrderStatus.PICKED.value,
        parent_order_id=parent_order.id,
        inflow_data={
            "orderNumber": "TH3002-P",
            "contactName": "User Four",
            "email": "user.four@example.com",
            "shippingAddress": {"address1": "404 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
        },
    )
    session.add(parent_order)
    session.commit()
    session.add(child_order)
    session.commit()
    parent_order.has_remainder = "Y"
    parent_order.remainder_order_id = child_order.id
    session.commit()

    from app.services.order_service import OrderService

    service = OrderService(session)
    captured_picklist_payloads: list[dict[str, Any]] = []
    captured_order_details_payloads: list[dict[str, Any]] = []

    class FakeSharePointService:
        is_enabled = True

        def upload_pdf(self, pdf_path: str, subfolder: str, filename: str) -> str:
            return f"sharepoint://{subfolder}/{filename}"

        def upload_file(self, pdf_content, subfolder: str, filename: str) -> str:
            return f"sharepoint://{subfolder}/{filename}"

    def fake_generate_picklist_pdf(self, inflow_data, output_path):
        captured_picklist_payloads.append(inflow_data)
        Path(output_path).write_bytes(b"%PDF-1.4 fake picklist\n")

    def fake_generate_order_details_pdf(inflow_data):
        captured_order_details_payloads.append(inflow_data)
        return b"%PDF-1.4 fake order details\n"

    with tempfile.TemporaryDirectory() as tmpdir:
        service._local_doc_path = lambda category, filename: Path(tmpdir) / category / filename  # type: ignore[method-assign]

        with patch("app.services.sharepoint_service.get_sharepoint_service", return_value=FakeSharePointService()):
            with patch(
                "app.services.picklist_service.PicklistService.generate_picklist_pdf",
                new=fake_generate_picklist_pdf,
            ):
                fake_pdf_module = SimpleNamespace(
                    pdf_service=SimpleNamespace(generate_order_details_pdf=fake_generate_order_details_pdf)
                )
                fake_email_module = SimpleNamespace(
                    email_service=SimpleNamespace(
                        is_configured=lambda: True,
                        send_order_details_email=lambda **kwargs: True,
                    )
                )
                with patch.dict(
                    sys.modules,
                    {
                        "app.services.pdf_service": fake_pdf_module,
                        "app.services.email_service": fake_email_module,
                    },
                ):
                    with patch(
                        "app.services.order_service.SystemSettingService.is_setting_enabled",
                        return_value=False,
                    ):
                        with patch(
                            "app.services.order_service.SystemSettingService.get_setting",
                            return_value="false",
                        ):
                            result = service.generate_picklist(
                                parent_order.id,
                                generated_by="tech@example.com",
                                generated_by_display="tech@example.com",
                                create_partial_leg=False,
                            )

    assert result.id == parent_order.id
    assert captured_picklist_payloads[0]["lines"] == [
        {
            "productId": "prod-2",
            "product": {"name": "Dock", "sku": "DOCK-1"},
            "quantity": {"standardQuantity": 1.0},
        },
    ]
    assert captured_picklist_payloads[0]["pickLines"] == captured_picklist_payloads[0]["lines"]
    assert captured_order_details_payloads[0]["lines"] == captured_picklist_payloads[0]["lines"]

    session.close()
    engine.dispose()


def test_parent_remainder_document_view_keeps_items_when_fully_picked():
    """A remainder leg should keep showing its leg items even after all of them are picked."""

    session, engine = _make_sqlite_session()
    parent_order = Order(
        id="order-parent-5",
        inflow_order_id="TH3003",
        inflow_sales_order_id="sales-order-3003",
        recipient_name="User Five",
        recipient_contact="user.five@example.com",
        delivery_location="Building 505",
        po_number="PO-3003",
        status=OrderStatus.PICKED.value,
        inflow_data={
            "orderNumber": "TH3003",
            "contactName": "User Five",
            "email": "user.five@example.com",
            "shippingAddress": {"address1": "505 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                },
                {
                    "productId": "prod-2",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
        },
    )
    session.add(parent_order)
    session.commit()

    from app.services.order_splitting import OrderSplittingService

    service = OrderSplittingService(session)
    service.create_partial_picklist_leg(parent_order, user_id="tech@example.com")
    session.refresh(parent_order)

    # Simulate the remainder leg being fully picked later in its own workflow.
    parent_order.inflow_data = {
        **parent_order.inflow_data,
        "pickLines": [
            {
                "productId": "prod-1",
                "product": {"name": "Laptop", "sku": "LAP-1"},
                "quantity": {"standardQuantity": "1"},
            },
            {
                "productId": "prod-2",
                "product": {"name": "Dock", "sku": "DOCK-1"},
                "quantity": {"standardQuantity": "1"},
            },
        ],
    }
    session.commit()

    document_view = service.build_parent_remainder_document_view(parent_order)

    assert document_view is not None
    assert document_view["lines"] == [
        {
            "productId": "prod-2",
            "product": {"name": "Dock", "sku": "DOCK-1"},
            "quantity": {"standardQuantity": 1.0},
        },
    ]
    assert document_view["pickLines"] == [
        {
            "productId": "prod-2",
            "product": {"name": "Dock", "sku": "DOCK-1"},
            "quantity": {"standardQuantity": 1.0},
        },
    ]

    session.close()
    engine.dispose()


def test_parent_remainder_document_view_recovers_split_items_from_full_parent_payload():
    """If the parent order drifts back to the full original payload, the remainder view should still show only the split remainder."""

    session, engine = _make_sqlite_session()
    parent_order = Order(
        id="order-parent-6",
        inflow_order_id="TH3004",
        inflow_sales_order_id="sales-order-3004",
        recipient_name="User Six",
        recipient_contact="user.six@example.com",
        delivery_location="Building 606",
        po_number="PO-3004",
        status=OrderStatus.PICKED.value,
        inflow_data={
            "orderNumber": "TH3004",
            "contactName": "User Six",
            "email": "user.six@example.com",
            "shippingAddress": {"address1": "606 Example St"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                },
                {
                    "productId": "prod-2",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                },
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Laptop", "sku": "LAP-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
        },
    )
    session.add(parent_order)
    session.commit()

    from app.services.order_splitting import OrderSplittingService

    service = OrderSplittingService(session)
    child_order = service.create_partial_picklist_leg(parent_order, user_id="tech@example.com")
    session.refresh(parent_order)

    assert child_order is not None

    # Simulate the parent order being refreshed from InFlow back to the full original payload.
    parent_order.inflow_data = {
        "orderNumber": "TH3004",
        "contactName": "User Six",
        "email": "user.six@example.com",
        "shippingAddress": {"address1": "606 Example St"},
        "lines": [
            {
                "productId": "prod-1",
                "product": {"name": "Laptop", "sku": "LAP-1"},
                "quantity": {"standardQuantity": "1"},
            },
            {
                "productId": "prod-2",
                "product": {"name": "Dock", "sku": "DOCK-1"},
                "quantity": {"standardQuantity": "1"},
            },
        ],
        "pickLines": [
            {
                "productId": "prod-1",
                "product": {"name": "Laptop", "sku": "LAP-1"},
                "quantity": {"standardQuantity": "1"},
            },
            {
                "productId": "prod-2",
                "product": {"name": "Dock", "sku": "DOCK-1"},
                "quantity": {"standardQuantity": "1"},
            },
        ],
    }
    session.commit()

    document_view = service.build_parent_remainder_document_view(parent_order)

    assert document_view is not None
    assert document_view["lines"] == [
        {
            "productId": "prod-2",
            "product": {"name": "Dock", "sku": "DOCK-1"},
            "quantity": {"standardQuantity": 1.0},
        },
    ]

    session.close()
    engine.dispose()


def test_generate_picklist_raises_when_sharepoint_upload_fails():
    """Picklist generation should fail if SharePoint upload is unavailable."""

    session, engine = _make_sqlite_session()
    order = Order(
        id="order-picklist-1",
        inflow_order_id="TH000140",
        inflow_sales_order_id="sales-order-140",
        recipient_name="User One",
        recipient_contact="user.one@example.com",
        delivery_location="Building 101",
        po_number="PO-0140",
        status=OrderStatus.PICKED.value,
        tagged_by="tech@example.com",
        inflow_data={
            "orderNumber": "TH000140",
            "contactName": "User One",
            "email": "user.one@example.com",
            "shippingAddress": {"address1": "123 Example St"},
            "customFields": {"custom4": "UIN-1"},
            "lines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
            "pickLines": [
                {
                    "productId": "prod-1",
                    "product": {"name": "Dock", "sku": "DOCK-1"},
                    "quantity": {"standardQuantity": "1"},
                }
            ],
        },
    )
    session.add(order)
    session.commit()

    from app.services.order_service import OrderService

    service = OrderService(session)

    class FakeSharePointService:
        is_enabled = True

        def upload_pdf(self, pdf_path: str, subfolder: str, filename: str) -> str:
            raise RuntimeError("sharepoint offline")

    def fake_generate_picklist_pdf(self, inflow_data, output_path):
        Path(output_path).write_bytes(b"%PDF-1.4 fake picklist\n")

    with tempfile.TemporaryDirectory() as tmpdir:
        service._local_doc_path = lambda category, filename: Path(tmpdir) / category / filename  # type: ignore[method-assign]

        with patch("app.services.sharepoint_service.get_sharepoint_service", return_value=FakeSharePointService()):
            with patch(
                "app.services.picklist_service.PicklistService.generate_picklist_pdf",
                new=fake_generate_picklist_pdf,
            ):
                with patch(
                    "app.services.order_service.SystemSettingService.is_setting_enabled",
                    return_value=False,
                ):
                    with patch(
                        "app.services.order_service.SystemSettingService.get_setting",
                        return_value="false",
                    ):
                        with patch.object(service, "_send_order_details_email", return_value=True):
                            try:
                                service.generate_picklist(
                                    order.id,
                                    generated_by="tech@example.com",
                                    generated_by_display="tech@example.com",
                                )
                                raised = False
                            except RuntimeError as exc:
                                raised = True
                                assert "sharepoint offline" in str(exc)

        local_path = Path(tmpdir) / "picklists" / "TH000140.pdf"
        assert local_path.exists()
        assert local_path.read_bytes().startswith(b"%PDF-1.4 fake picklist")

    assert raised is True
    session.close()
    engine.dispose()


def test_order_details_generated_pdf_is_uploaded_to_sharepoint():
    """Generated order-details PDFs should be uploaded and store the SharePoint URL."""

    class FakeSharePointService:
        is_enabled = True

        def __init__(self) -> None:
            self.upload_calls: list[tuple[bytes, str, str]] = []

        def download_file(self, subfolder: str, filename: str) -> bytes | None:
            return None

        def upload_file(self, content: bytes, subfolder: str, filename: str) -> str:
            self.upload_calls.append((content, subfolder, filename))
            return f"sharepoint://{subfolder}/{filename}"

    fake_sp_service = FakeSharePointService()

    order = SimpleNamespace(
        id="order-5",
        inflow_order_id="TH1005",
        recipient_contact="user@example.com",
        recipient_name="User",
        inflow_data={"orderNumber": "TH1005", "lines": [], "pickLines": [], "packLines": []},
        order_details_path=None,
        order_details_generated_at=None,
    )

    db = SimpleNamespace(commit=lambda: None, refresh=lambda _order: None)
    from app.services.order_service import OrderService

    service = OrderService(db=cast(Any, db))

    with tempfile.TemporaryDirectory() as tmpdir:
        service._storage_path = lambda *parts: Path(tmpdir).joinpath(*parts)  # type: ignore[method-assign]

        with patch(
            "app.services.sharepoint_service.get_sharepoint_service",
            return_value=fake_sp_service,
        ):
            fake_pdf_module = types.ModuleType("app.services.pdf_service")
            fake_pdf_module.pdf_service = SimpleNamespace(
                generate_order_details_pdf=lambda payload: b"fresh-pdf"
            )
            with patch.dict(
                sys.modules,
                {"app.services.pdf_service": fake_pdf_module},
            ):
                with patch(
                    "app.services.email_service.email_service.is_configured",
                    return_value=False,
                ):
                    success = service._send_order_details_email(order)

    assert success is False
    assert fake_sp_service.upload_calls == [(b"fresh-pdf", "order-details", "TH1005.pdf")]
    assert order.order_details_path == "sharepoint://order-details/TH1005.pdf"
    assert order.order_details_generated_at is not None
    print("[PASS] Generated order-details PDFs upload to SharePoint")


if __name__ == "__main__":
    print("Running partial-order workflow tests...")
    print()

    test_fulfill_sales_order_appends_new_partial_shipment_lines()
    test_asset_tag_serials_only_include_unshipped_remaining_items()
    test_partial_order_remainder_creation_links_parent_and_child()
    test_partial_order_details_regenerate_instead_of_reusing_sharepoint_pdf()
    test_order_details_generated_pdf_is_uploaded_to_sharepoint()

    print()
    print("[SUCCESS] All partial-order workflow tests passed!")
