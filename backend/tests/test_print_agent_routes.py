#!/usr/bin/env python3

import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from flask import Flask

sys.path.append(".")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")


class _FakeDb:
    def close(self):
        return None


class _FakePrintJobService:
    job: Any = None

    def __init__(self, _db):
        pass

    def get_job(self, _job_id: str):
        return self.job


class _FakeSharePointService:
    def __init__(self, content: bytes | None):
        self.content = content

    def download_file(self, subfolder: str, filename: str) -> bytes | None:
        assert subfolder == "picklists"
        assert filename == "TH4377.pdf"
        return self.content


def _make_app() -> Flask:
    from app.api.routes.system import bp as system_bp

    app = Flask(__name__)
    app.register_blueprint(system_bp)
    return app


def test_print_agent_download_falls_back_to_sharepoint_when_local_file_missing():
    app = _make_app()
    _FakePrintJobService.job = SimpleNamespace(
        id="job-1",
        file_path="/tmp/missing-picklist.pdf",
        order=SimpleNamespace(inflow_order_id="TH4377"),
    )

    with app.test_client() as client:
        with (
            patch("app.api.routes.system.get_db_session", return_value=_FakeDb()),
            patch("app.api.routes.system.PrintJobService", _FakePrintJobService),
            patch(
                "app.services.sharepoint_service.get_sharepoint_service",
                return_value=_FakeSharePointService(b"%PDF-1.4 fallback\n"),
            ),
            patch("app.config.settings.picklist_print_agent_token", "secret-token"),
        ):
            response = client.get(
                "/api/system/print-agent/jobs/job-1/file",
                headers={"Authorization": "Bearer secret-token"},
            )

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data == b"%PDF-1.4 fallback\n"


def test_print_agent_download_returns_404_when_local_and_sharepoint_files_are_missing():
    app = _make_app()
    _FakePrintJobService.job = SimpleNamespace(
        id="job-1",
        file_path="/tmp/missing-picklist.pdf",
        order=SimpleNamespace(inflow_order_id="TH4377"),
    )

    with app.test_client() as client:
        with (
            patch("app.api.routes.system.get_db_session", return_value=_FakeDb()),
            patch("app.api.routes.system.PrintJobService", _FakePrintJobService),
            patch(
                "app.services.sharepoint_service.get_sharepoint_service",
                return_value=_FakeSharePointService(None),
            ),
            patch("app.config.settings.picklist_print_agent_token", "secret-token"),
        ):
            response = client.get(
                "/api/system/print-agent/jobs/job-1/file",
                headers={"Authorization": "Bearer secret-token"},
            )

    assert response.status_code == 404
    assert response.get_json() == {"error": "Picklist file not found"}


def test_print_agent_download_uses_local_file_when_present():
    app = _make_app()

    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / "TH4377.pdf"
        pdf_path.write_bytes(b"%PDF-1.4 local\n")
        _FakePrintJobService.job = SimpleNamespace(
            id="job-1",
            file_path=str(pdf_path),
            order=SimpleNamespace(inflow_order_id="TH4377"),
        )

        with app.test_client() as client:
            with (
                patch("app.api.routes.system.get_db_session", return_value=_FakeDb()),
                patch("app.api.routes.system.PrintJobService", _FakePrintJobService),
                patch(
                    "app.services.sharepoint_service.get_sharepoint_service",
                    return_value=_FakeSharePointService(None),
                ),
                patch("app.config.settings.picklist_print_agent_token", "secret-token"),
            ):
                response = client.get(
                    "/api/system/print-agent/jobs/job-1/file",
                    headers={"Authorization": "Bearer secret-token"},
                )

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data == b"%PDF-1.4 local\n"


def test_print_agent_download_falls_back_to_sharepoint_when_file_path_is_empty():
    app = _make_app()
    _FakePrintJobService.job = SimpleNamespace(
        id="job-1",
        file_path="",
        order=SimpleNamespace(inflow_order_id="TH4377"),
    )

    with app.test_client() as client:
        with (
            patch("app.api.routes.system.get_db_session", return_value=_FakeDb()),
            patch("app.api.routes.system.PrintJobService", _FakePrintJobService),
            patch(
                "app.services.sharepoint_service.get_sharepoint_service",
                return_value=_FakeSharePointService(b"%PDF-1.4 empty-path\n"),
            ),
            patch("app.config.settings.picklist_print_agent_token", "secret-token"),
        ):
            response = client.get(
                "/api/system/print-agent/jobs/job-1/file",
                headers={"Authorization": "Bearer secret-token"},
            )

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data == b"%PDF-1.4 empty-path\n"


if __name__ == "__main__":
    test_print_agent_download_falls_back_to_sharepoint_when_local_file_missing()
    print(
        "[PASS] print_agent_download_falls_back_to_sharepoint_when_local_file_missing"
    )
    test_print_agent_download_returns_404_when_local_and_sharepoint_files_are_missing()
    print(
        "[PASS] print_agent_download_returns_404_when_local_and_sharepoint_files_are_missing"
    )
    test_print_agent_download_uses_local_file_when_present()
    print("[PASS] print_agent_download_uses_local_file_when_present")
    test_print_agent_download_falls_back_to_sharepoint_when_file_path_is_empty()
    print(
        "[PASS] print_agent_download_falls_back_to_sharepoint_when_file_path_is_empty"
    )
    print("[SUCCESS] Print agent route tests passed")
