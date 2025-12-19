class OrderNotFoundError(Exception):
    """Order not found"""
    pass


class InvalidStatusTransitionError(Exception):
    """Invalid status transition"""
    pass


class TeamsNotificationError(Exception):
    """Teams notification error"""
    pass
