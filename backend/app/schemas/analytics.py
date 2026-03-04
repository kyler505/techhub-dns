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
    # Human-friendly order number (inFlow order id), when available.
    order_number: Optional[str] = None
    timestamp: datetime
    description: str
    changed_by: Optional[str] = None
    # Optional status change details (present for status_change events).
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    reason: Optional[str] = None

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


class WorkflowDailyTrendDataPoint(BaseModel):
    """Daily workflow transition counts used by dashboard line graph."""

    date: str
    shipped_count: int
    delivered_count: int
    fulfilled_count: int
    picked_count: int

    model_config = {"from_attributes": True}


class WorkflowDailyTrendsResponse(BaseModel):
    """Daily workflow trends response."""

    period: str
    data: List[WorkflowDailyTrendDataPoint]

    model_config = {"from_attributes": True}


class FulfilledTotalDataPoint(BaseModel):
    """Aggregated fulfillment total for a month or year period."""

    period: str
    fulfilled_count: int

    model_config = {"from_attributes": True}


class FulfilledTotalsResponse(BaseModel):
    """Monthly/yearly fulfilled totals response."""

    period: str
    data: List[FulfilledTotalDataPoint]

    model_config = {"from_attributes": True}


__all__ = [
    "StatusCountsResponse",
    "DeliveryPerformanceResponse",
    "ActivityItem",
    "RecentActivityResponse",
    "TimeTrendDataPoint",
    "TimeTrendsResponse",
    "WorkflowDailyTrendDataPoint",
    "WorkflowDailyTrendsResponse",
    "FulfilledTotalDataPoint",
    "FulfilledTotalsResponse",
]
