from __future__ import annotations

from datetime import datetime
from typing import Optional

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

    def checkout(
        self,
        vehicle: str,
        checked_out_by: str,
        purpose: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> VehicleCheckout:
        vehicle_norm = self._validate_vehicle(vehicle)
        checked_out_by_norm = (checked_out_by or "").strip()
        if not checked_out_by_norm:
            raise ValidationError("checked_out_by is required", field="checked_out_by")

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
            checked_out_by=checked_out_by_norm,
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
        checked_in_by: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> VehicleCheckout:
        vehicle_norm = self._validate_vehicle(vehicle)
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

        checked_in_by_norm = (checked_in_by or "").strip() or None
        notes_norm = (notes or "").strip() or None
        if notes_norm:
            if checkout.notes:
                checkout.notes = f"{checkout.notes}\n\n[Checkin note] {notes_norm}"
            else:
                checkout.notes = f"[Checkin note] {notes_norm}"

        checkout.checked_in_at = datetime.utcnow()
        checkout.checked_in_by = checked_in_by_norm
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
