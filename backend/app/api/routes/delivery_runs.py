from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db, SessionLocal
from app.services.delivery_run_service import DeliveryRunService
from app.schemas.delivery_run import CreateDeliveryRunRequest, DeliveryRunResponse, DeliveryRunDetailResponse, OrderSummary
from app.models.delivery_run import VehicleEnum

router = APIRouter(prefix="/delivery-runs", tags=["delivery-runs"])

# Simple in-memory broadcaster for WebSocket clients
_active_websockets: List[WebSocket] = []


async def _broadcast_active_runs(db_session: Session = None):
    """Send current active runs to all connected websockets."""
    # Create our own session if none provided
    if db_session is None:
        db_session = SessionLocal()

    try:
        service = DeliveryRunService(db_session)
        runs = service.get_active_runs_with_details()
        payload = []
        for r in runs:
            payload.append({
                "id": str(r.id),
                "name": r.name,
                "runner": r.runner,
                "vehicle": r.vehicle,
                "status": r.status,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "order_ids": [str(o.id) for o in r.orders]
            })

        # Broadcast
        to_remove = []
        for ws in _active_websockets:
            try:
                await ws.send_json({"type": "active_runs", "data": payload})
            except Exception:
                to_remove.append(ws)

        for rem in to_remove:
            try:
                _active_websockets.remove(rem)
            except ValueError:
                pass
    finally:
        if db_session is not None and db_session is not SessionLocal():
            db_session.close()


@router.post("", response_model=DeliveryRunResponse)
def create_run(request: CreateDeliveryRunRequest, db: Session = Depends(get_db)):
    service = DeliveryRunService(db)
    try:
        run = service.create_run(runner=request.runner, order_ids=request.order_ids, vehicle=request.vehicle)

        # Fire-and-forget: notify websockets asynchronously via background task in route handlers
        # Caller (router) can schedule broadcast in ASGI server; here we just attempt a sync-friendly notify
        # WebSocket broadcasting is best-effort; errors shouldn't block creation
        try:
            import asyncio
            asyncio.create_task(_broadcast_active_runs())
        except Exception:
            pass

        return DeliveryRunResponse(
            id=run.id,
            name=run.name,
            runner=run.runner,
            vehicle=run.vehicle,
            status=run.status,
            start_time=run.start_time,
            end_time=run.end_time,
            order_ids=[o.id for o in run.orders]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/active", response_model=List[DeliveryRunResponse])
def get_active_runs(db: Session = Depends(get_db)):
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
        ))
    return result


@router.get("/vehicles/available")
def get_available_vehicles(db: Session = Depends(get_db)):
    # Simple availability: check for vehicle not currently active
    service = DeliveryRunService(db)
    vehicles = {v.value: service.check_vehicle_availability(v.value) for v in VehicleEnum}
    return vehicles


@router.get("/{run_id}", response_model=DeliveryRunDetailResponse)
def get_run(run_id: UUID, db: Session = Depends(get_db)):
    service = DeliveryRunService(db)
    run = service.get_run_by_id(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Delivery run not found")

    return DeliveryRunDetailResponse(
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
                status=o.status
            ) for o in run.orders
        ]
    )


@router.put("/{run_id}/finish", response_model=DeliveryRunResponse)
def finish_run(run_id: UUID, db: Session = Depends(get_db)):
    service = DeliveryRunService(db)
    try:
        run = service.finish_run(run_id)

        try:
            import asyncio
            asyncio.create_task(_broadcast_active_runs())
        except Exception:
            pass

        return DeliveryRunResponse(
            id=run.id,
            name=run.name,
            runner=run.runner,
            vehicle=run.vehicle,
            status=run.status,
            start_time=run.start_time,
            end_time=run.end_time,
            order_ids=[o.id for o in run.orders]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    _active_websockets.append(websocket)
    try:
        # Send initial snapshot
        await _broadcast_active_runs(db)

        while True:
            # Keep connection alive; no client messages required
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        try:
            _active_websockets.remove(websocket)
        except ValueError:
            pass
