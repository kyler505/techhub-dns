from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.delivery_run import VehicleEnum


def _allowed_vehicles() -> list[str]:
    return [v.value for v in VehicleEnum]


def _normalize_non_empty(value: str, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required")
    return normalized


class CheckoutRequest(BaseModel):
    vehicle: str
    checked_out_by: str
    purpose: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("vehicle")
    @classmethod
    def validate_vehicle(cls, v: str) -> str:
        allowed = _allowed_vehicles()
        v_norm = (v or "").strip()
        if v_norm not in allowed:
            raise ValueError(f"Vehicle must be one of: {allowed}")
        return v_norm

    @field_validator("checked_out_by")
    @classmethod
    def validate_checked_out_by(cls, v: str) -> str:
        return _normalize_non_empty(v, "checked_out_by")

    @field_validator("purpose")
    @classmethod
    def validate_purpose(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None

    @field_validator("notes")
    @classmethod
    def validate_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None


class CheckinRequest(BaseModel):
    vehicle: str
    checked_in_by: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("vehicle")
    @classmethod
    def validate_vehicle(cls, v: str) -> str:
        allowed = _allowed_vehicles()
        v_norm = (v or "").strip()
        if v_norm not in allowed:
            raise ValueError(f"Vehicle must be one of: {allowed}")
        return v_norm

    @field_validator("checked_in_by")
    @classmethod
    def validate_checked_in_by(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None

    @field_validator("notes")
    @classmethod
    def validate_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None


class VehicleCheckoutResponse(BaseModel):
    id: UUID
    vehicle: str
    checked_out_by: str
    purpose: Optional[str] = None
    checked_out_at: datetime
    checked_in_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VehicleStatusItem(BaseModel):
    vehicle: str
    checked_out: bool
    checked_out_by: Optional[str] = None
    delivery_run_active: bool


class VehicleStatusResponse(BaseModel):
    vehicles: List[VehicleStatusItem] = Field(default_factory=list)
