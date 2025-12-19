from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
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
