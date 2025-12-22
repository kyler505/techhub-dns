from pydantic import BaseModel
from typing import Optional, Dict, Any


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
    request_id: Optional[str] = None
