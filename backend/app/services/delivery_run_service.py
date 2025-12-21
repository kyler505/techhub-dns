from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID

from app.models.delivery_run import DeliveryRun, DeliveryRunStatus, VehicleEnum
from app.utils.timezone import is_morning_in_cst, get_date_in_cst
from sqlalchemy import func
from app.models.order import Order, OrderStatus


class DeliveryRunService:
    def __init__(self, db: Session):
        self.db = db

    def generate_run_name(self, run_time: datetime) -> str:
        """Generate a run name based on time and existing runs that day."""
        from app.utils.timezone import get_cst_datetime

        cst_time = get_cst_datetime(run_time)
        date_str = cst_time.strftime("%Y-%m-%d")
        is_morning = cst_time.hour < 12

        # Create datetime objects for the day boundaries in UTC
        # We need to convert CST boundaries back to UTC for database queries
        cst_tz_offset = timedelta(hours=-6)  # CST is UTC-6

        if is_morning:
            # Morning: 00:00 to 11:59 CST
            morning_start_cst = datetime.strptime(f"{date_str} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone(cst_tz_offset))
            morning_end_cst = datetime.strptime(f"{date_str} 11:59:59", "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone(cst_tz_offset))

            # Convert to UTC for database query
            morning_start_utc = morning_start_cst.astimezone(timezone.utc)
            morning_end_utc = morning_end_cst.astimezone(timezone.utc)

            existing_runs = self.db.query(DeliveryRun).filter(
                and_(
                    DeliveryRun.created_at >= morning_start_utc,
                    DeliveryRun.created_at <= morning_end_utc
                )
            ).count()
            run_number = existing_runs + 1
            return f"Morning Run {run_number}"
        else:
            # Afternoon: 12:00 CST onwards
            afternoon_start_cst = datetime.strptime(f"{date_str} 12:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone(cst_tz_offset))
            day_end_cst = datetime.strptime(f"{date_str} 23:59:59", "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone(cst_tz_offset))

            # Convert to UTC for database query
            afternoon_start_utc = afternoon_start_cst.astimezone(timezone.utc)
            day_end_utc = day_end_cst.astimezone(timezone.utc)

            existing_runs = self.db.query(DeliveryRun).filter(
                and_(
                    DeliveryRun.created_at >= afternoon_start_utc,
                    DeliveryRun.created_at <= day_end_utc
                )
            ).count()
            run_number = existing_runs + 1
            return f"Afternoon Run {run_number}"

    def check_vehicle_availability(self, vehicle: str) -> bool:
        """Return True if vehicle is available (no active run using it)"""
        active = self.db.query(DeliveryRun).filter(
            and_(DeliveryRun.vehicle == vehicle, DeliveryRun.status == DeliveryRunStatus.ACTIVE.value)
        ).first()
        return active is None

    def create_run(self, runner: str, order_ids: List[UUID], vehicle: str) -> DeliveryRun:
        """Create a delivery run and assign orders to it.

        Validates that orders are in Pre-Delivery and that the vehicle is available.
        """
        # Vehicle availability
        if not self.check_vehicle_availability(vehicle):
            raise ValueError(f"Vehicle {vehicle} is currently in use")

        # Validate orders
        orders = self.db.query(Order).filter(Order.id.in_(order_ids)).with_for_update().all()
        if len(orders) != len(order_ids):
            raise ValueError("One or more orders not found")

        for o in orders:
            if o.status != OrderStatus.PRE_DELIVERY:
                raise ValueError(f"Order {o.inflow_order_id or o.id} not in Pre-Delivery")

        # Generate run name
        run_time = datetime.utcnow()
        run_name = self.generate_run_name(run_time)

        # Create run
        run = DeliveryRun(
            name=run_name,
            runner=runner,
            vehicle=vehicle,
            status=DeliveryRunStatus.ACTIVE.value,
            start_time=run_time
        )
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

    def get_run_by_id(self, run_id: UUID) -> DeliveryRun | None:
        return self.db.query(DeliveryRun).filter(DeliveryRun.id == run_id).first()

    def get_active_runs_with_details(self) -> List[DeliveryRun]:
        return self.db.query(DeliveryRun).filter(DeliveryRun.status == DeliveryRunStatus.ACTIVE.value).all()

    def finish_run(self, run_id: UUID) -> DeliveryRun:
        run = self.db.query(DeliveryRun).filter(DeliveryRun.id == run_id).with_for_update().first()
        if not run:
            raise ValueError("DeliveryRun not found")

        # TODO: validate signatures/bundles exist for each order before marking Delivered
        run.status = DeliveryRunStatus.COMPLETED.value
        run.end_time = datetime.utcnow()
        run.updated_at = datetime.utcnow()

        # Mark orders as Delivered
        for o in run.orders:
            o.status = OrderStatus.DELIVERED
            o.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(run)
        return run
