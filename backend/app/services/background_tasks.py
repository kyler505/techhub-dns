"""
Background Task Service for asynchronous processing.

Provides utilities for running tasks in background threads,
especially useful for non-critical operations like SharePoint uploads
that shouldn't block API responses.
"""

import threading
import logging
from typing import Callable, Any, Optional

logger = logging.getLogger(__name__)


class BackgroundTaskService:
    """
    Service for executing tasks in background threads.

    Example usage:
        BackgroundTaskService.run_async(
            upload_to_sharepoint,
            file_path="/path/to/file.pdf",
            folder="picklists"
        )
    """

    @staticmethod
    def run_async(
        task: Callable,
        *args,
        task_name: Optional[str] = None,
        on_success: Optional[Callable] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
        **kwargs
    ) -> threading.Thread:
        """
        Execute a task in a background thread.

        Args:
            task: The function to execute
            *args: Positional arguments to pass to the task
            task_name: Optional name for logging purposes
            on_success: Optional callback on successful completion
            on_error: Optional callback on error (receives exception)
            **kwargs: Keyword arguments to pass to the task

        Returns:
            The thread object (for testing/monitoring purposes)
        """
        name = task_name or task.__name__

        def wrapper():
            try:
                logger.debug(f"[BackgroundTask] Starting: {name}")
                result = task(*args, **kwargs)
                logger.debug(f"[BackgroundTask] Completed: {name}")

                if on_success:
                    on_success(result)

            except Exception as e:
                logger.error(f"[BackgroundTask] Failed: {name} - {e}", exc_info=True)

                if on_error:
                    try:
                        on_error(e)
                    except Exception as callback_error:
                        logger.error(f"[BackgroundTask] Error callback failed: {callback_error}")

        thread = threading.Thread(target=wrapper, name=f"bg-{name}", daemon=True)
        thread.start()

        logger.debug(f"[BackgroundTask] Dispatched: {name}")
        return thread

    @staticmethod
    def run_async_simple(task: Callable, *args, **kwargs) -> None:
        """
        Simple fire-and-forget async execution.

        Logs errors but doesn't provide callbacks.

        Args:
            task: The function to execute
            *args: Positional arguments to pass to the task
            **kwargs: Keyword arguments to pass to the task
        """
        BackgroundTaskService.run_async(task, *args, **kwargs)


# Convenience function for easier imports
def run_in_background(
    task: Callable,
    *args,
    task_name: Optional[str] = None,
    **kwargs
) -> threading.Thread:
    """
    Run a task in the background.

    This is a convenience wrapper around BackgroundTaskService.run_async.

    Example:
        run_in_background(upload_file, file_path, task_name="upload_pdf")
    """
    return BackgroundTaskService.run_async(
        task,
        *args,
        task_name=task_name,
        **kwargs
    )
