from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID

from app.models.delivery_run import DeliveryRun, DeliveryRunStatus, VehicleEnum
from app.models.order import Order, OrderStatus


class DeliveryRunService:
    def __init__(self, db: Session):
        self.db = db

    def check_vehicle_availability(self, vehicle: VehicleEnum) -> bool:
        """Return True if vehicle is available (no active run using it)"""
        active = self.db.query(DeliveryRun).filter(
            and_(DeliveryRun.vehicle == vehicle, DeliveryRun.status == DeliveryRunStatus.ACTIVE)
        ).first()
        return active is None

    def create_run(self, runner: str, order_ids: List[UUID], vehicle: VehicleEnum) -> DeliveryRun:
        """Create a delivery run and assign orders to it.

        Validates that orders are in Pre-Delivery and that the vehicle is available.
        """
        # Vehicle availability
        if not self.check_vehicle_availability(vehicle):
            raise ValueError(f"Vehicle {vehicle.value} is currently in use")

        # Validate orders
        orders = self.db.query(Order).filter(Order.id.in_(order_ids)).with_for_update().all()
        if len(orders) != len(order_ids):
            raise ValueError("One or more orders not found")

        for o in orders:
            if o.status != OrderStatus.PRE_DELIVERY:
                raise ValueError(f"Order {o.inflow_order_id or o.id} not in Pre-Delivery")

        # Create run
        run = DeliveryRun(runner=runner, vehicle=vehicle, status=DeliveryRunStatus.ACTIVE, start_time=datetime.utcnow())
        self.db.add(run)
        self.db.flush()  # ensure run.id available

        # Assign orders
        for o in orders:
            o.delivery_run_id = run.id
            o.status = OrderStatus.IN_DELIVERY
            o.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(run)
        return run

    def get_active_runs_with_details(self) -> List[DeliveryRun]:
        return self.db.query(DeliveryRun).filter(DeliveryRun.status == DeliveryRunStatus.ACTIVE).all()

    def finish_run(self, run_id: UUID) -> DeliveryRun:
        run = self.db.query(DeliveryRun).filter(DeliveryRun.id == run_id).with_for_update().first()
        if not run:
            raise ValueError("DeliveryRun not found")

        # TODO: validate signatures/bundles exist for each order before marking Delivered
        run.status = DeliveryRunStatus.COMPLETED
        run.end_time = datetime.utcnow()
        run.updated_at = datetime.utcnow()

        # Mark orders as Delivered
        for o in run.orders:
            o.status = OrderStatus.DELIVERED
            o.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(run)
        return run
