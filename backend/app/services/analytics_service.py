from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.order import Order, OrderStatus
from app.models.delivery_run import DeliveryRun, DeliveryRunStatus
from app.models.audit_log import AuditLog


class AnalyticsService:
    """Service for analytics and dashboard data aggregation"""

    def __init__(self, db: Session):
        self.db = db

    def get_order_status_counts(self) -> Dict[str, int]:
        """
        Get count of orders grouped by status.
        
        Returns:
            Dict mapping status names to counts, e.g. {"picked": 5, "qa": 3, "delivered": 10}
        """
        results = self.db.query(
            Order.status,
            func.count(Order.id).label('count')
        ).group_by(Order.status).all()

        if not results:
            return {}

        return {status: count for status, count in results}

    def get_delivery_performance(self) -> Dict[str, int]:
        """
        Get delivery performance metrics.
        
        Returns:
            Dict with keys:
            - active_runs: count of delivery runs with status=Active
            - completed_today: count of orders delivered today
            - ready_for_delivery: count of orders with status=pre-delivery
        """
        # Count active delivery runs
        active_runs = self.db.query(func.count(DeliveryRun.id)).filter(
            DeliveryRun.status == DeliveryRunStatus.ACTIVE.value
        ).scalar() or 0

        # Count orders completed today (delivered status + delivered today)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        completed_today = self.db.query(func.count(Order.id)).filter(
            Order.status == OrderStatus.DELIVERED.value,
            Order.updated_at >= today_start
        ).scalar() or 0

        # Count orders ready for delivery (pre-delivery status)
        ready_for_delivery = self.db.query(func.count(Order.id)).filter(
            Order.status == OrderStatus.PRE_DELIVERY.value
        ).scalar() or 0

        return {
            "active_runs": active_runs,
            "completed_today": completed_today,
            "ready_for_delivery": ready_for_delivery
        }

    def get_recent_activity(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get recent activity combining recent orders and audit log entries.
        
        Returns recent orders (by created_at) and status changes (from audit logs),
        merged and sorted by timestamp, returning the latest N items.
        
        Args:
            limit: Maximum number of items to return
            
        Returns:
            List of dicts with keys: type, timestamp, description, order_id, status (for changes)
        """
        activity = []

        # Get recent orders
        recent_orders = self.db.query(Order).order_by(
            Order.created_at.desc()
        ).limit(limit * 2).all()  # Get extra to account for filtering

        for order in recent_orders:
            activity.append({
                "type": "order_created",
                "timestamp": order.created_at,
                "description": f"Order {order.inflow_order_id} created",
                "order_id": order.id,
                "inflow_order_id": order.inflow_order_id
            })

        # Get recent audit log entries (status changes)
        recent_changes = self.db.query(AuditLog).order_by(
            AuditLog.timestamp.desc()
        ).limit(limit * 2).all()

        for log in recent_changes:
            activity.append({
                "type": "status_change",
                "timestamp": log.timestamp,
                "description": f"Status changed to {log.to_status}",
                "order_id": log.order_id,
                "from_status": log.from_status,
                "to_status": log.to_status,
                "changed_by": log.changed_by,
                "reason": log.reason
            })

        # Sort by timestamp descending and return top N
        activity.sort(key=lambda x: x["timestamp"], reverse=True)
        return activity[:limit]

    def get_time_trends(self, period: str = "day", days: int = 7) -> List[Dict[str, Any]]:
        """
        Get time-series data for orders grouped by date.
        
        Args:
            period: Grouping period ("day", "week", "month") - currently only "day" supported
            days: Number of days to look back
            
        Returns:
            List of dicts with keys: date, count, status_breakdown
            Example: [
                {"date": "2025-01-29", "count": 5, "status_breakdown": {"picked": 2, "delivered": 3}},
                {"date": "2025-01-28", "count": 3, "status_breakdown": {"picked": 1, "delivered": 2}}
            ]
        """
        if period != "day":
            # Only day period supported for now
            period = "day"

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Query orders grouped by date
        results = self.db.query(
            func.date(Order.signature_captured_at).label('date'),
            Order.status,
            func.count(Order.id).label('count')
        ).filter(
            Order.status == OrderStatus.DELIVERED.value,
            Order.signature_captured_at.isnot(None),
            Order.signature_captured_at >= cutoff_date
        ).group_by(
            func.date(Order.signature_captured_at),
            Order.status
        ).order_by(
            func.date(Order.signature_captured_at).desc()
        ).all()

        if not results:
            return []

        # Aggregate by date
        trends = {}
        for date, status, count in results:
            date_str = str(date)
            if date_str not in trends:
                trends[date_str] = {
                    "date": date_str,
                    "count": 0,
                    "status_breakdown": {}
                }
            trends[date_str]["count"] += count
            trends[date_str]["status_breakdown"][status] = count

        # Convert to list and sort by date descending
        return sorted(trends.values(), key=lambda x: x["date"], reverse=True)
