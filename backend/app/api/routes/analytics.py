from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.analytics_service import AnalyticsService
from app.schemas.analytics import (
    StatusCountsResponse,
    DeliveryPerformanceResponse,
    RecentActivityResponse,
    ActivityItem,
    TimeTrendsResponse,
    TimeTrendDataPoint
)

bp = Blueprint('analytics', __name__)
bp.strict_slashes = False


@bp.route('/order-status-counts', methods=['GET'])
def get_order_status_counts():
    """Get count of orders grouped by status"""
    with get_db() as db:
        service = AnalyticsService(db)
        result = service.get_order_status_counts()
        # Return flat object (frontend expects { picked: 5, qa: 3, ... })
        return jsonify(result)


@bp.route('/delivery-performance', methods=['GET'])
def get_delivery_performance():
    """Get delivery performance metrics"""
    with get_db() as db:
        service = AnalyticsService(db)
        result = service.get_delivery_performance()
        return jsonify(DeliveryPerformanceResponse(**result).model_dump())


@bp.route('/recent-activity', methods=['GET'])
def get_recent_activity():
    """Get recent activity log"""
    limit = request.args.get('limit', 20, type=int)
    limit = max(1, min(limit, 100))  # Validate: 1-100
    
    with get_db() as db:
        service = AnalyticsService(db)
        result = service.get_recent_activity(limit=limit)
        
        # Convert to ActivityItem objects
        items = []
        for item in result:
            activity_item = ActivityItem(
                type=item['type'],
                order_id=str(item['order_id']),
                timestamp=item['timestamp'],
                description=item['description'],
                changed_by=item.get('changed_by')
            )
            items.append(activity_item)
        
        return jsonify(RecentActivityResponse(items=items).model_dump())


@bp.route('/time-trends', methods=['GET'])
def get_time_trends():
    """Get time-series analytics data"""
    period = request.args.get('period', 'day')
    days = request.args.get('days', 7, type=int)
    
    # Validate period
    if period not in ['day', 'week', 'month']:
        return jsonify({"error": "Invalid period. Must be 'day', 'week', or 'month'"}), 400
    
    # Validate days
    days = max(1, min(days, 365))  # 1-365 days
    
    with get_db() as db:
        service = AnalyticsService(db)
        result = service.get_time_trends(period=period, days=days)
        
        # Convert to TimeTrendDataPoint objects
        data_points = []
        for item in result:
            data_point = TimeTrendDataPoint(
                date=item['date'],
                count=item['count'],
                status_breakdown=item.get('status_breakdown')
            )
            data_points.append(data_point)
        
        return jsonify(TimeTrendsResponse(period=period, data=data_points).model_dump())
