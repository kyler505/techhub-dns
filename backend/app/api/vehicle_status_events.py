from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.database import get_db_session
from app.schemas.vehicle_checkout import VehicleStatusItem, VehicleStatusResponse
from app.services.vehicle_checkout_service import VehicleCheckoutService


logger = logging.getLogger(__name__)


def broadcast_vehicle_status_update_sync(db_session: Session | None = None) -> None:
    """Broadcast current vehicle statuses to fleet subscribers."""
    owns_session = db_session is None
    session = db_session if db_session is not None else get_db_session()

    try:
        service = VehicleCheckoutService(session)
        items = [VehicleStatusItem(**status) for status in service.get_vehicle_statuses()]
        payload = VehicleStatusResponse(vehicles=items).model_dump(mode="json")

        try:
            from app.main import socketio

            socketio.emit("vehicle_status_update", payload, room="fleet")
        except Exception as exc:
            logger.error(f"Failed to broadcast vehicle statuses: {exc}")
    finally:
        if owns_session:
            session.close()
