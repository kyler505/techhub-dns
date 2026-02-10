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
from app.models.vehicle_checkout import VehicleCheckout
from app.utils.exceptions import NotFoundError, ValidationError


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

    def _validate_vehicle(self, vehicle: str) -> str:
        allowed = {v.value for v in VehicleEnum}
        vehicle_norm = (vehicle or "").strip()
        if vehicle_norm not in allowed:
            raise ValidationError(
                f"Vehicle must be one of: {sorted(allowed)}",
                field="vehicle",
                details={"allowed": sorted(allowed), "provided": vehicle},
            )
        return vehicle_norm

    def _get_authenticated_actor(self) -> tuple[str, str, Optional[str]]:
        user_id = (getattr(g, "user_id", None) or "").strip()
        if not user_id:
            raise ValidationError("Authentication required")

        user = getattr(g, "user", None)
        email = (getattr(user, "email", None) or "").strip()
        display_name = (getattr(user, "display_name", None) or "").strip() or None
        if not email:
            raise ValidationError("Authenticated user missing email")

        return user_id, email, display_name

    def _format_actor_display(self, email: str, display_name: Optional[str]) -> str:
        return (display_name or "").strip() or email.strip()

    def _get_active_checkout(self, vehicle: str) -> VehicleCheckout | None:
        return self.db.query(VehicleCheckout).filter(
            and_(VehicleCheckout.vehicle == vehicle, VehicleCheckout.checked_in_at.is_(None))
        ).first()

    def create_run_for_current_user(self, order_ids: List[Union[UUID, str]], vehicle: str) -> DeliveryRun:
        vehicle_norm = self._validate_vehicle(vehicle)
        actor_user_id, actor_email, actor_display_name = self._get_authenticated_actor()
        runner_display = self._format_actor_display(actor_email, actor_display_name)

        active_checkout = self._get_active_checkout(vehicle_norm)
        if not active_checkout:
            raise ValidationError(
                f"Vehicle {vehicle_norm} must be checked out before starting a delivery run",
                field="vehicle",
                details={"vehicle": vehicle_norm, "required_checkout_type": "delivery_run"},
            )

        if (active_checkout.checked_out_by_user_id or "").strip() != actor_user_id:
            raise ValidationError(
                f"Vehicle {vehicle_norm} is checked out by a different user",
                field="runner",
                details={
                    "vehicle": vehicle_norm,
                    "checked_out_by": active_checkout.checked_out_by,
                },
            )

        checkout_type = (getattr(active_checkout, "checkout_type", "") or "").strip() or "delivery_run"
        if checkout_type != "delivery_run":
            purpose = (active_checkout.purpose or "").strip() or None
            reason = "Vehicle is checked out for 'Other'"
            if purpose:
                reason += f" (purpose: {purpose})"

            raise ValidationError(
                f"{reason}. Check the vehicle in, then check it out again for a Delivery run.",
                field="checkout_type",
                details={
                    "vehicle": vehicle_norm,
                    "checkout_type": checkout_type,
                    "purpose": purpose,
                    "required_checkout_type": "delivery_run",
                },
            )

        return self.create_run(runner=runner_display, order_ids=order_ids, vehicle=vehicle_norm)

    def create_run(self, runner: str, order_ids: List[Union[UUID, str]], vehicle: str) -> DeliveryRun:
        """Create a delivery run and assign orders to it.

        Validates that orders are in Pre-Delivery and that the vehicle is available.
        """
        vehicle_norm = self._validate_vehicle(vehicle)

        # Vehicle availability
        if not self.check_vehicle_availability(vehicle_norm):
            raise ValidationError(f"Vehicle {vehicle} is currently in use", details={"vehicle": vehicle})

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
            runner=runner,
            vehicle=vehicle_norm,
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
                changed_by=runner,
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
            user_id=runner,  # Runner who created the run
            description=f"Delivery run created by {runner}",
            audit_metadata={
                "vehicle": vehicle_norm,
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

    def get_all_run_details(self, status: Optional[List[str]] = None, vehicle: Optional[str] = None) -> List[DeliveryRun]:
        """Get all delivery runs, optionally filtered by status/vehicle."""
        query = self.db.query(DeliveryRun)

        if status:
            query = query.filter(DeliveryRun.status.in_(status))

        if vehicle is not None:
            vehicle_norm = self._validate_vehicle(vehicle)
            query = query.filter(DeliveryRun.vehicle == vehicle_norm)

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
