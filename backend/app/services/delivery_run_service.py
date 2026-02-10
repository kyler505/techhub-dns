import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from flask import g
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID
from typing import Union

from app.models.delivery_run import DeliveryRun, DeliveryRunStatus, VehicleEnum
from app.utils.timezone import is_morning_in_cst, get_date_in_cst
from sqlalchemy import func
from app.models.order import Order, OrderStatus
from app.models.audit_log import AuditLog
from app.services.audit_service import AuditService
from app.services.inflow_service import InflowService
from app.utils.exceptions import NotFoundError, ValidationError
from app.services.vehicle_checkout_service import VehicleCheckoutService


class DeliveryRunService:
    def __init__(self, db: Session):
        self.db = db

    def _get_authenticated_runner(self) -> tuple[str, str]:
        user_id = (getattr(g, "user_id", None) or "").strip()
        if not user_id:
            raise ValidationError("Authentication required")

        user = getattr(g, "user", None)
        email = (getattr(user, "email", None) or "").strip()
        display_name = (getattr(user, "display_name", None) or "").strip()

        runner = display_name or email
        if not runner:
            raise ValidationError("Authenticated user missing identity")

        return user_id, runner

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
                    DeliveryRun.created_at < run_time.replace(tzinfo=timezone.utc)
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
                    DeliveryRun.created_at < run_time.replace(tzinfo=timezone.utc)
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

    def create_run(self, order_ids: List[Union[UUID, str]], vehicle: str, _runner: Optional[str] = None) -> DeliveryRun:
        """Create a delivery run and assign orders to it.

        Validates that orders are in Pre-Delivery and that the vehicle is available.
        """
        # Identity is derived from the authenticated session.
        runner_user_id, runner_display = self._get_authenticated_runner()

        # Vehicle availability
        if not self.check_vehicle_availability(vehicle):
            raise ValidationError(f"Vehicle {vehicle} is currently in use", details={"vehicle": vehicle})

        # Vehicle checkout gating: require active checkout and current user must match.
        checkout_service = VehicleCheckoutService(self.db)
        active_checkout = checkout_service.get_active_checkout(vehicle)
        if not active_checkout:
            raise ValidationError(
                f"Vehicle {vehicle} must be checked out before starting a delivery run",
                field="vehicle",
                details={"vehicle": vehicle},
            )

        checkout_user_id = (getattr(active_checkout, "checked_out_by_user_id", None) or "").strip()
        if checkout_user_id:
            if checkout_user_id != runner_user_id:
                raise ValidationError(
                    "Vehicle is checked out by a different user",
                    field="runner",
                    details={
                        "vehicle": vehicle,
                        "checked_out_by": active_checkout.checked_out_by,
                        "checked_out_by_user_id": checkout_user_id,
                    },
                )
        else:
            # Backward compatibility for legacy checkouts created before user IDs were stored.
            if active_checkout.checked_out_by != runner_display:
                raise ValidationError(
                    "Vehicle is checked out by a different user",
                    field="runner",
                    details={"vehicle": vehicle, "checked_out_by": active_checkout.checked_out_by},
                )

        # Convert order IDs to strings for MySQL compatibility
        order_ids_str = [str(oid) for oid in order_ids]

        # Validate orders
        orders = self.db.query(Order).filter(Order.id.in_(order_ids_str)).with_for_update().all()
        if len(orders) != len(order_ids_str):
            raise ValidationError("One or more orders not found", details={"expected_count": len(order_ids), "found_count": len(orders)})

        for o in orders:
            if o.status != OrderStatus.PRE_DELIVERY.value:
                raise ValidationError(
                    f"Order {o.inflow_order_id or o.id} not in Pre-Delivery",
                    details={"order_id": str(o.id), "current_status": o.status}
                )

        # Generate run name
        run_time = datetime.utcnow()
        run_name = self.generate_run_name(run_time)

        # Create run
        run = DeliveryRun(
            name=run_name,
            runner=runner_display,
            vehicle=vehicle,
            status=DeliveryRunStatus.ACTIVE.value,
            start_time=run_time
        )
        self.db.add(run)
        self.db.flush()  # ensure run.id available

        # Assign orders and create audit logs for status changes
        for o in orders:
            old_status = o.status
            o.delivery_run_id = run.id
            o.status = OrderStatus.IN_DELIVERY.value
            o.updated_at = datetime.utcnow()

            # Create AuditLog entry for timeline display
            audit_log = AuditLog(
                order_id=o.id,
                changed_by=runner_display,
                from_status=old_status,
                to_status=OrderStatus.IN_DELIVERY.value,
                reason=f"Added to delivery run: {run_name}",
                timestamp=datetime.utcnow()
            )
            self.db.add(audit_log)

        self.db.commit()
        self.db.refresh(run)

        # Also log to system audit log for full traceability
        audit_service = AuditService(self.db)
        audit_service.log_delivery_run_action(
            run_id=str(run.id),
            action="created",
            user_id=runner_user_id,
            description=f"Delivery run created by {runner_display}",
            audit_metadata={
                "vehicle": vehicle,
                "order_count": len(order_ids),
                "order_ids": order_ids_str,
                "run_name": run_name
            }
        )

        return run

    def get_run_by_id(self, run_id: Union[UUID, str]) -> DeliveryRun | None:
        run_id_str = str(run_id)
        return self.db.query(DeliveryRun).filter(DeliveryRun.id == run_id_str).first()

    def get_active_runs_with_details(self) -> List[DeliveryRun]:
        return self.db.query(DeliveryRun).filter(DeliveryRun.status == DeliveryRunStatus.ACTIVE.value).all()

    def get_all_run_details(self, status: Optional[List[str]] = None) -> List[DeliveryRun]:
        """Get all delivery runs, optionally filtered by status"""
        query = self.db.query(DeliveryRun)

        if status:
            query = query.filter(DeliveryRun.status.in_(status))

        return query.order_by(DeliveryRun.created_at.desc()).all()

    def _fulfill_orders_in_inflow(self, orders: List[Order], user_id: Optional[str]) -> tuple[List[dict], List[dict]]:
        if not orders:
            return [], []

        inflow_service = InflowService()

        async def _fulfill() -> tuple[List[dict], List[dict]]:
            successes: List[dict] = []
            failures: List[dict] = []

            for order in orders:
                inflow_sales_order_id = order.inflow_sales_order_id
                if not inflow_sales_order_id:
                    failures.append({
                        "order_id": str(order.id),
                        "inflow_order_id": order.inflow_order_id,
                        "error": "missing_inflow_sales_order_id"
                    })
                    continue

                try:
                    await inflow_service.fulfill_sales_order(
                        inflow_sales_order_id,
                        db=self.db,
                        user_id=user_id,
                        only_picked_items=True  # Only fulfill items that were actually picked
                    )
                    successes.append({
                        "order_id": str(order.id),
                        "inflow_order_id": order.inflow_order_id,
                        "inflow_sales_order_id": inflow_sales_order_id
                    })
                except Exception as exc:
                    failures.append({
                        "order_id": str(order.id),
                        "inflow_order_id": order.inflow_order_id,
                        "inflow_sales_order_id": inflow_sales_order_id,
                        "error": str(exc)
                    })

            return successes, failures

        return asyncio.run(_fulfill())

    def finish_run(self, run_id: Union[UUID, str], user_id: Optional[str] = None, create_remainders: bool = True) -> DeliveryRun:
        """
        Finish a delivery run: fulfill orders in InFlow and optionally create remainder orders.

        Args:
            run_id: ID of the delivery run
            user_id: User completing the run
            create_remainders: If True, create remainder orders for partial picks (user confirmed)
        """
        from app.services.order_splitting import OrderSplittingService

        run_id_str = str(run_id)
        run = self.db.query(DeliveryRun).filter(DeliveryRun.id == run_id_str).with_for_update().first()
        if not run:
            raise NotFoundError("DeliveryRun", str(run_id))

        # Validate ALL orders are already delivered
        undelivered_orders = [o for o in run.orders if o.status != OrderStatus.DELIVERED.value]
        if undelivered_orders:
            raise ValidationError(
                f"Cannot finish delivery run: {len(undelivered_orders)} orders are not yet delivered",
                details={
                    "undelivered_count": len(undelivered_orders),
                    "undelivered_order_ids": [str(o.id) for o in undelivered_orders]
                }
            )

        inflow_successes, inflow_failures = self._fulfill_orders_in_inflow(run.orders, user_id)

        audit_service = AuditService(self.db)
        if inflow_failures:
            audit_service.log_delivery_run_action(
                run_id=str(run_id),
                action="completion_failed",
                user_id=user_id,
                description="Delivery run completion failed during inFlow fulfillment",
                audit_metadata={
                    "order_count": len(run.orders),
                    "fulfilled_orders": inflow_successes,
                    "failed_orders": inflow_failures
                }
            )
            self.db.commit()
            raise ValidationError(
                "Cannot finish delivery run: inFlow fulfillment failed for one or more orders",
                details={
                    "failed_orders": inflow_failures,
                    "fulfilled_count": len(inflow_successes)
                }
            )

        # Create remainder orders for partial picks (if user confirmed)
        remainder_results = {"remainder_count": 0, "remainders_created": []}
        if create_remainders:
            splitting_service = OrderSplittingService(self.db)
            remainder_results = splitting_service.process_partial_fulfillments(
                orders=run.orders,
                user_id=user_id,
                create_remainders=True
            )

        run.status = DeliveryRunStatus.COMPLETED.value
        run.end_time = datetime.utcnow()
        run.updated_at = datetime.utcnow()

        audit_service.log_delivery_run_action(
            run_id=str(run_id),
            action="completed",
            user_id=user_id,
            description="Delivery run completed",
            audit_metadata={
                "order_count": len(run.orders),
                "completed_at": run.end_time.isoformat(),
                "fulfilled_orders": inflow_successes,
                "remainders_created": remainder_results.get("remainder_count", 0)
            }
        )

        self.db.commit()
        self.db.refresh(run)

        return run
