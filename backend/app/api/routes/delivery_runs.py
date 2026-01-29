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
        # Emit via SocketIO to all connected clients in 'orders' room
        try:
            from app.main import socketio
            # Dashboard listens to 'active_runs' and joins 'orders' room
            socketio.emit('active_runs', {"type": "active_runs", "data": payload}, room='orders')
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to broadcast active runs: {e}")
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

            # Trigger Teams notifications for orders in delivery
            try:
                from app.services.teams_recipient_service import teams_recipient_service
                teams_recipient_service.notify_orders_in_delivery(run.orders)
            except Exception as e:
                # Log but don't fail the request
                from app.api.routes.orders import logger as order_logger
                order_logger.error(f"Failed to trigger Teams notifications for delivery run: {e}")

            response = DeliveryRunResponse(
                id=run.id,
                name=run.name,
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


@bp.route("", methods=["GET"])
def get_runs():
    """Get delivery runs (optionally filtered by status)"""
    status_filter = request.args.getlist('status')

    with get_db() as db:
        service = DeliveryRunService(db)
        runs = service.get_all_run_details(status=status_filter if status_filter else None)

        result = []
        for r in runs:
            result.append(DeliveryRunResponse(
                id=r.id,
                name=r.name,
                runner=r.runner,
                vehicle=r.vehicle,
                status=r.status,
                start_time=r.start_time,
                end_time=r.end_time,
                order_ids=[o.id for o in r.orders]
            ).model_dump())
        return jsonify(result)


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
                name=r.name,
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
        vehicles = {v.value: service.check_vehicle_availability(v.value) for v in VehicleEnum}
        return jsonify(vehicles)

@bp.route("/<uuid:run_id>", methods=["GET"])
def get_run(run_id):
    """Get delivery run details"""
    with get_db() as db:
        service = DeliveryRunService(db)
        run = service.get_run_by_id(run_id)
        if not run:
            abort(404, description="Delivery run not found")

        from app.schemas.delivery_run import DeliveryRunDetailResponse, OrderSummary

        response = DeliveryRunDetailResponse(
            id=run.id,
            name=run.name,
            runner=run.runner,
            vehicle=run.vehicle,
            status=run.status,
            start_time=run.start_time,
            end_time=run.end_time,
            orders=[
                OrderSummary(
                    id=o.id,
                    inflow_order_id=o.inflow_order_id,
                    recipient_name=o.recipient_name,
                    delivery_location=o.delivery_location,
                    status=o.status
                ) for o in run.orders
            ]
        )
        return jsonify(response.model_dump())


@bp.route("/<run_id>/finish", methods=["PUT"])
def finish_run(run_id):
    """Finish a delivery run, optionally creating remainder orders for partial picks"""
    data = request.get_json() or {}
    create_remainders = data.get("create_remainders", True)  # Default to True if not specified

    with get_db() as db:
        service = DeliveryRunService(db)
        try:
            run = service.finish_run(
                UUID(run_id),
                create_remainders=create_remainders
            )

            # Broadcast via SocketIO in background
            threading.Thread(target=_broadcast_active_runs_sync).start()

            response = DeliveryRunResponse(
                id=run.id,
                name=run.name,
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
