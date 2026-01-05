from flask import Blueprint, request, jsonify, abort
from flask_socketio import emit
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import threading

from app.database import get_db, get_db_session
from app.services.delivery_run_service import DeliveryRunService
from app.schemas.delivery_run import CreateDeliveryRunRequest, DeliveryRunResponse
from app.models.delivery_run import VehicleEnum

bp = Blueprint('delivery_runs', __name__)
bp.strict_slashes = False


def _broadcast_active_runs_sync(db_session: Session = None):
    """Send current active runs to all connected clients (sync version)."""
    if db_session is None:
        db_session = get_db_session()

    try:
        service = DeliveryRunService(db_session)
        runs = service.get_active_runs_with_details()
        payload = []
        for r in runs:
            payload.append({
                "id": str(r.id),
                "runner": r.runner,
                "vehicle": r.vehicle.value if hasattr(r.vehicle, 'value') else str(r.vehicle),
                "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "order_ids": [str(o.id) for o in r.orders]
            })

        # Emit via SocketIO to all connected clients
        try:
            from app.main import socketio
            socketio.emit('active_runs', {"type": "active_runs", "data": payload})
        except Exception:
            pass  # SocketIO broadcasting is best-effort
    finally:
        if db_session is not None:
            db_session.close()


@bp.route("", methods=["POST"])
def create_run():
    """Create a new delivery run"""
    data = request.get_json()

    with get_db() as db:
        service = DeliveryRunService(db)
        try:
            req = CreateDeliveryRunRequest(**data)
            run = service.create_run(runner=req.runner, order_ids=req.order_ids, vehicle=req.vehicle)

            # Broadcast via SocketIO in background
            threading.Thread(target=_broadcast_active_runs_sync).start()

            response = DeliveryRunResponse(
                id=run.id,
                runner=run.runner,
                vehicle=run.vehicle,
                status=run.status,
                start_time=run.start_time,
                end_time=run.end_time,
                order_ids=[o.id for o in run.orders]
            )
            return jsonify(response.model_dump())
        except ValueError as e:
            abort(400, description=str(e))


@bp.route("/active", methods=["GET"])
def get_active_runs():
    """Get all active delivery runs"""
    with get_db() as db:
        service = DeliveryRunService(db)
        runs = service.get_active_runs_with_details()
        result = []
        for r in runs:
            result.append(DeliveryRunResponse(
                id=r.id,
                runner=r.runner,
                vehicle=r.vehicle,
                status=r.status,
                start_time=r.start_time,
                end_time=r.end_time,
                order_ids=[o.id for o in r.orders]
            ).model_dump())
        return jsonify(result)


@bp.route("/vehicles/available", methods=["GET"])
def get_available_vehicles():
    """Get available vehicles"""
    with get_db() as db:
        service = DeliveryRunService(db)
        vehicles = {v.value: service.check_vehicle_availability(v) for v in VehicleEnum}
        return jsonify(vehicles)


@bp.route("/<run_id>/finish", methods=["PUT"])
def finish_run(run_id):
    """Finish a delivery run"""
    with get_db() as db:
        service = DeliveryRunService(db)
        try:
            run = service.finish_run(UUID(run_id))

            # Broadcast via SocketIO in background
            threading.Thread(target=_broadcast_active_runs_sync).start()

            response = DeliveryRunResponse(
                id=run.id,
                runner=run.runner,
                vehicle=run.vehicle,
                status=run.status,
                start_time=run.start_time,
                end_time=run.end_time,
                order_ids=[o.id for o in run.orders]
            )
            return jsonify(response.model_dump())
        except ValueError as e:
            abort(400, description=str(e))


# SocketIO event handlers will be registered in main.py
