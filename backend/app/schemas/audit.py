from pydantic import BaseModel, Field, field_serializer
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from uuid import UUID


class AuditLogResponse(BaseModel):
    id: UUID
    order_id: UUID
    changed_by: Optional[str] = None
    from_status: Optional[str] = None
    to_status: str
    reason: Optional[str] = None
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = Field(None, alias="extra_metadata")

    model_config = {"from_attributes": True}

    @field_serializer("timestamp", when_used="json")
    def _serialize_timestamp(self, timestamp: datetime) -> str:
        dt = timestamp
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        dt_utc = dt.astimezone(timezone.utc)
        return dt_utc.isoformat().replace("+00:00", "Z")
