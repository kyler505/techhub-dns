class DNSApiError(Exception):
    """Base exception for DNS API errors"""
    def __init__(self, code: str, message: str, status_code: int = 400, field: str = None, details: dict = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.field = field
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(DNSApiError):
    def __init__(self, message: str, field: str = None, details: dict = None):
        super().__init__("VALIDATION_ERROR", message, 400, field, details)


class NotFoundError(DNSApiError):
    def __init__(self, resource: str, resource_id: str = None):
        message = f"{resource} not found"
        if resource_id:
            message += f": {resource_id}"
        super().__init__("NOT_FOUND", message, 404, details={"resource": resource, "resource_id": resource_id})


class StatusTransitionError(DNSApiError):
    def __init__(self, current_status: str, requested_status: str, reason: str = None):
        message = f"Invalid status transition from {current_status} to {requested_status}"
        if reason:
            message += f": {reason}"
        super().__init__(
            "INVALID_STATUS_TRANSITION",
            message,
            400,
            details={"current_status": current_status, "requested_status": requested_status}
        )


class FileOperationError(DNSApiError):
    def __init__(self, operation: str, file_path: str, reason: str = None):
        message = f"File {operation} failed for {file_path}"
        if reason:
            message += f": {reason}"
        super().__init__("FILE_OPERATION_ERROR", message, 500, details={"operation": operation, "file_path": file_path})


class ExternalServiceError(DNSApiError):
    def __init__(self, service_name: str, operation: str, reason: str = None):
        message = f"External service error: {service_name} {operation}"
        if reason:
            message += f": {reason}"
        super().__init__(
            "EXTERNAL_SERVICE_ERROR",
            message,
            502,
            details={"service": service_name, "operation": operation}
        )


# Legacy exceptions for backward compatibility
class OrderNotFoundError(NotFoundError):
    """Order not found"""
    def __init__(self, order_id: str = None):
        super().__init__("Order", order_id)


class InvalidStatusTransitionError(StatusTransitionError):
    """Invalid status transition"""
    def __init__(self, current_status: str, requested_status: str, reason: str = None):
        super().__init__(current_status, requested_status, reason)


class TeamsNotificationError(ExternalServiceError):
    """Teams notification error"""
    def __init__(self, operation: str, reason: str = None):
        super().__init__("Teams", operation, reason)
