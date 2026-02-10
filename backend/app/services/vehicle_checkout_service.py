from __future__ import annotations

from datetime import datetime
from typing import Optional

from flask import g
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.delivery_run import DeliveryRun, DeliveryRunStatus, VehicleEnum
from app.models.vehicle_checkout import VehicleCheckout
from app.utils.exceptions import ValidationError


class VehicleCheckoutService:
    def __init__(self, db: Session):
        self.db = db

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

    def _delivery_run_active(self, vehicle: str) -> bool:
        active = self.db.query(DeliveryRun).filter(
            and_(DeliveryRun.vehicle == vehicle, DeliveryRun.status == DeliveryRunStatus.ACTIVE.value)
        ).first()
        return active is not None

    def get_active_checkout(self, vehicle: str) -> Optional[VehicleCheckout]:
        vehicle_norm = self._validate_vehicle(vehicle)
        return self.db.query(VehicleCheckout).filter(
            and_(VehicleCheckout.vehicle == vehicle_norm, VehicleCheckout.checked_in_at.is_(None))
        ).first()

    def get_active_checkouts(self) -> list[VehicleCheckout]:
        return self.db.query(VehicleCheckout).filter(VehicleCheckout.checked_in_at.is_(None)).all()

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

    def checkout(
        self,
        vehicle: str,
        purpose: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> VehicleCheckout:
        vehicle_norm = self._validate_vehicle(vehicle)
        actor_user_id, actor_email, actor_display_name = self._get_authenticated_actor()
        checked_out_by_display = self._format_actor_display(actor_email, actor_display_name)

        if self._delivery_run_active(vehicle_norm):
            raise ValidationError(
                f"Vehicle {vehicle_norm} is currently in use",
                details={"vehicle": vehicle_norm, "delivery_run_active": True},
            )

        existing = self.db.query(VehicleCheckout).filter(
            and_(VehicleCheckout.vehicle == vehicle_norm, VehicleCheckout.checked_in_at.is_(None))
        ).first()
        if existing:
            raise ValidationError(
                f"Vehicle {vehicle_norm} is already checked out",
                details={
                    "vehicle": vehicle_norm,
                    "checked_out_by": existing.checked_out_by,
                    "checked_out_at": existing.checked_out_at.isoformat() if existing.checked_out_at else None,
                },
            )

        checkout = VehicleCheckout(
            vehicle=vehicle_norm,
            checked_out_by=checked_out_by_display,
            checked_out_by_user_id=actor_user_id,
            checked_out_by_email=actor_email,
            checked_out_by_display_name=actor_display_name,
            purpose=(purpose.strip() if purpose else None) or None,
            notes=(notes.strip() if notes else None) or None,
            checked_out_at=datetime.utcnow(),
        )
        self.db.add(checkout)
        self.db.commit()
        self.db.refresh(checkout)
        return checkout

    def checkin(
        self,
        vehicle: str,
        notes: Optional[str] = None,
    ) -> VehicleCheckout:
        vehicle_norm = self._validate_vehicle(vehicle)
        actor_user_id, actor_email, actor_display_name = self._get_authenticated_actor()
        checked_in_by_display = self._format_actor_display(actor_email, actor_display_name)
        if self._delivery_run_active(vehicle_norm):
            raise ValidationError(
                f"Cannot check in {vehicle_norm} while a delivery run is active",
                details={"vehicle": vehicle_norm, "delivery_run_active": True},
            )

        checkout = self.db.query(VehicleCheckout).filter(
            and_(VehicleCheckout.vehicle == vehicle_norm, VehicleCheckout.checked_in_at.is_(None))
        ).first()
        if not checkout:
            raise ValidationError(
                f"Vehicle {vehicle_norm} is not currently checked out",
                details={"vehicle": vehicle_norm},
            )

        notes_norm = (notes or "").strip() or None
        if notes_norm:
            if checkout.notes:
                checkout.notes = f"{checkout.notes}\n\n[Checkin note] {notes_norm}"
            else:
                checkout.notes = f"[Checkin note] {notes_norm}"

        checkout.checked_in_at = datetime.utcnow()
        checkout.checked_in_by = checked_in_by_display
        checkout.checked_in_by_user_id = actor_user_id
        checkout.checked_in_by_email = actor_email
        checkout.checked_in_by_display_name = actor_display_name
        checkout.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(checkout)
        return checkout

    def get_vehicle_statuses(self) -> list[dict]:
        statuses: list[dict] = []
        for v in VehicleEnum:
            vehicle = v.value
            active_checkout = self.db.query(VehicleCheckout).filter(
                and_(VehicleCheckout.vehicle == vehicle, VehicleCheckout.checked_in_at.is_(None))
            ).first()
            statuses.append(
                {
                    "vehicle": vehicle,
                    "checked_out": active_checkout is not None,
                    "checked_out_by": active_checkout.checked_out_by if active_checkout else None,
                    "delivery_run_active": self._delivery_run_active(vehicle),
                }
            )
        return statuses
