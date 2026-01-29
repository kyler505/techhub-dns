from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime


class StatusCountsResponse(BaseModel):
    """Order counts grouped by status"""
    counts: Dict[str, int]

    model_config = {"from_attributes": True}


class DeliveryPerformanceResponse(BaseModel):
    """Delivery performance metrics"""
    active_runs: int
    completed_today: int
    ready_for_delivery: int

    model_config = {"from_attributes": True}


class ActivityItem(BaseModel):
    """Individual activity log entry"""
    type: str
    order_id: str
    timestamp: datetime
    description: str
    changed_by: Optional[str] = None

    model_config = {"from_attributes": True}


class RecentActivityResponse(BaseModel):
    """Recent activity log response"""
    items: List[ActivityItem]

    model_config = {"from_attributes": True}


class TimeTrendDataPoint(BaseModel):
    """Single data point in time trend"""
    date: str
    count: int
    status_breakdown: Optional[Dict[str, int]] = None

    model_config = {"from_attributes": True}


class TimeTrendsResponse(BaseModel):
    """Time trends analytics response"""
    period: str
    data: List[TimeTrendDataPoint]

    model_config = {"from_attributes": True}


__all__ = [
    "StatusCountsResponse",
    "DeliveryPerformanceResponse",
    "ActivityItem",
    "RecentActivityResponse",
    "TimeTrendDataPoint",
    "TimeTrendsResponse",
]
