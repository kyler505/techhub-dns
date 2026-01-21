#!/usr/bin/env python3
"""Tests for BackgroundTaskService"""

import sys
import time
sys.path.append('.')


def test_background_task_import():
    """Test that BackgroundTaskService can be imported"""
    from app.services.background_tasks import BackgroundTaskService, run_in_background
    assert BackgroundTaskService is not None
    assert run_in_background is not None
    print("[PASS] BackgroundTaskService import test passed")


def test_run_async_executes_task():
    """Test that run_async actually executes the task"""
    from app.services.background_tasks import BackgroundTaskService

    result_container = {"executed": False}

    def test_task():
        result_container["executed"] = True

    thread = BackgroundTaskService.run_async(test_task, task_name="test_task")
    thread.join(timeout=2.0)  # Wait for completion

    assert result_container["executed"] == True, "Task should have executed"
    print("[PASS] run_async executes task test passed")


def test_run_async_with_args():
    """Test that run_async passes arguments correctly"""
    from app.services.background_tasks import BackgroundTaskService

    result_container = {}

    def test_task_with_args(value1, value2, keyword_arg=None):
        result_container["values"] = (value1, value2, keyword_arg)

    thread = BackgroundTaskService.run_async(
        test_task_with_args,
        "arg1",
        "arg2",
        keyword_arg="kwarg",
        task_name="arg_task"
    )
    thread.join(timeout=2.0)

    assert result_container["values"] == ("arg1", "arg2", "kwarg")
    print("[PASS] run_async with args test passed")


def test_run_async_handles_errors():
    """Test that run_async logs errors but doesn't crash"""
    from app.services.background_tasks import BackgroundTaskService

    def failing_task():
        raise ValueError("Intentional test error")

    # Should not raise, error is logged
    thread = BackgroundTaskService.run_async(failing_task, task_name="failing_task")
    thread.join(timeout=2.0)

    # If we get here, error was handled
    print("[PASS] run_async handles errors test passed")


def test_run_async_calls_on_success():
    """Test that on_success callback is called"""
    from app.services.background_tasks import BackgroundTaskService

    result_container = {"callback_called": False}

    def successful_task():
        return "success"

    def on_success(result):
        result_container["callback_called"] = True
        result_container["result"] = result

    thread = BackgroundTaskService.run_async(
        successful_task,
        task_name="success_callback_task",
        on_success=on_success
    )
    thread.join(timeout=2.0)

    assert result_container["callback_called"] == True
    assert result_container["result"] == "success"
    print("[PASS] run_async on_success callback test passed")


def test_run_async_calls_on_error():
    """Test that on_error callback is called on failure"""
    from app.services.background_tasks import BackgroundTaskService

    result_container = {"error_callback_called": False}

    def failing_task():
        raise ValueError("Test error")

    def on_error(error):
        result_container["error_callback_called"] = True
        result_container["error"] = str(error)

    thread = BackgroundTaskService.run_async(
        failing_task,
        task_name="error_callback_task",
        on_error=on_error
    )
    thread.join(timeout=2.0)

    assert result_container["error_callback_called"] == True
    assert "Test error" in result_container["error"]
    print("[PASS] run_async on_error callback test passed")


def test_run_in_background_convenience():
    """Test run_in_background convenience function"""
    from app.services.background_tasks import run_in_background

    result_container = {"executed": False}

    def simple_task():
        result_container["executed"] = True

    thread = run_in_background(simple_task, task_name="simple_bg_task")
    thread.join(timeout=2.0)

    assert result_container["executed"] == True
    print("[PASS] run_in_background convenience test passed")


if __name__ == "__main__":
    print("Running BackgroundTaskService tests...")
    print()

    # Import tests
    test_background_task_import()

    # Functional tests
    test_run_async_executes_task()
    test_run_async_with_args()
    test_run_async_handles_errors()
    test_run_async_calls_on_success()
    test_run_async_calls_on_error()
    test_run_in_background_convenience()

    print()
    print("[SUCCESS] All BackgroundTaskService tests passed!")
