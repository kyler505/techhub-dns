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
    TimeTrendDataPoint,
    WorkflowDailyTrendDataPoint,
    WorkflowDailyTrendsResponse,
    FulfilledTotalDataPoint,
    FulfilledTotalsResponse,
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
                order_number=item.get('order_number'),
                timestamp=item['timestamp'],
                description=item['description'],
                changed_by=item.get('changed_by'),
                from_status=item.get('from_status'),
                to_status=item.get('to_status'),
                reason=item.get('reason'),
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


@bp.route('/workflow-daily-trends', methods=['GET'])
def get_workflow_daily_trends():
    """Get daily workflow transition counts used for dashboard multi-line chart."""
    days = request.args.get('days', 30, type=int)
    days = max(1, min(days, 365))

    with get_db() as db:
        service = AnalyticsService(db)
        result = service.get_workflow_daily_trends(days=days)

        data_points = [
            WorkflowDailyTrendDataPoint(
                date=item['date'],
                shipped_count=item['shipped_count'],
                delivered_count=item['delivered_count'],
                fulfilled_count=item['fulfilled_count'],
                picked_count=item['picked_count'],
            )
            for item in result
        ]

        return jsonify(WorkflowDailyTrendsResponse(period='day', data=data_points).model_dump())


@bp.route('/fulfilled-totals', methods=['GET'])
def get_fulfilled_totals():
    """Get fulfilled totals grouped by month or year."""
    period = request.args.get('period', 'month')

    if period not in ['month', 'year']:
        return jsonify({'error': "Invalid period. Must be 'month' or 'year'"}), 400

    with get_db() as db:
        service = AnalyticsService(db)
        if period == 'month':
            months = request.args.get('months', 12, type=int)
            months = max(1, min(months, 60))
            result = service.get_fulfilled_totals_by_month(months=months)
        else:
            years = request.args.get('years', 5, type=int)
            years = max(1, min(years, 20))
            result = service.get_fulfilled_totals_by_year(years=years)

        data_points = [
            FulfilledTotalDataPoint(period=item['period'], fulfilled_count=item['fulfilled_count'])
            for item in result
        ]
        return jsonify(FulfilledTotalsResponse(period=period, data=data_points).model_dump())
