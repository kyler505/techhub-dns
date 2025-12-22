from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from app.schemas.error import ErrorResponse
from app.utils.exceptions import DNSApiError
import logging
import uuid

logger = logging.getLogger(__name__)


async def error_handler_middleware(request: Request, call_next):
    """Global error handler middleware that converts exceptions to structured error responses."""
    try:
        return await call_next(request)
    except DNSApiError as e:
        logger.warning(f"DNS API Error: {e.code} - {e.message}")
        return JSONResponse(
            status_code=e.status_code,
            content=ErrorResponse(
                error={
                    "code": e.code,
                    "message": e.message,
                    "field": e.field,
                    "details": e.details
                },
                request_id=str(uuid.uuid4())
            ).dict()
        )
    except HTTPException as e:
        # Convert FastAPI HTTPException to our format
        logger.warning(f"HTTP Exception: {e.status_code} - {e.detail}")
        return JSONResponse(
            status_code=e.status_code,
            content=ErrorResponse(
                error={
                    "code": "HTTP_EXCEPTION",
                    "message": e.detail,
                    "details": {"status_code": e.status_code}
                },
                request_id=str(uuid.uuid4())
            ).dict()
        )
    except Exception as e:
        # Catch-all for unexpected errors
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error={
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "details": {"error_type": type(e).__name__}
                },
                request_id=str(uuid.uuid4())
            ).dict()
        )
