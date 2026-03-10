import os
import sys
import tempfile
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(".")

from app.database import Base
from app.models.order import Order, OrderStatus
from app.services.print_job_service import PrintJobService
from app.utils.exceptions import ConflictError


def _make_session():
    temp_dir = tempfile.TemporaryDirectory()
    db_path = Path(temp_dir.name) / "print_jobs.sqlite"
    engine = create_engine(f"sqlite:///{db_path}")
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    return temp_dir, TestingSession()


def _make_order(session, inflow_order_id: str, picklist_path: str) -> Order:
    order = Order(
        inflow_order_id=inflow_order_id,
        status=OrderStatus.PICKED.value,
        picklist_path=picklist_path,
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def test_enqueue_claim_and_complete_cycle():
    temp_dir, session = _make_session()
    try:
        pdf_path = Path(temp_dir.name) / "picklist.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\n")

        order = _make_order(session, "TH1001", str(pdf_path))
        service = PrintJobService(session)

        job = service.enqueue_picklist_print(
            order,
            trigger_source="automatic",
            requested_by="ops@example.com",
        )
        session.commit()
        assert job.status == "pending"

        claimed = service.claim_next_pending_job(claim_timeout_seconds=30)
        session.commit()
        assert claimed is not None
        assert claimed.id == job.id
        assert claimed.status == "claimed"
        assert claimed.attempt_count == 1

        completed = service.mark_completed(job.id)
        session.commit()
        assert completed.status == "completed"
        assert completed.completed_at is not None
    finally:
        session.close()
        temp_dir.cleanup()


def test_duplicate_pending_jobs_are_blocked():
    temp_dir, session = _make_session()
    try:
        pdf_path = Path(temp_dir.name) / "picklist.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\n")

        order = _make_order(session, "TH1002", str(pdf_path))
        service = PrintJobService(session)

        service.enqueue_picklist_print(
            order,
            trigger_source="automatic",
            requested_by="ops@example.com",
        )

        try:
            service.enqueue_picklist_print(
                order,
                trigger_source="manual",
                requested_by="admin@example.com",
            )
            raise AssertionError(
                "Expected ConflictError for duplicate pending print job"
            )
        except ConflictError:
            pass
    finally:
        session.close()
        temp_dir.cleanup()


def test_failed_job_can_be_requeued_manually():
    temp_dir, session = _make_session()
    try:
        pdf_path = Path(temp_dir.name) / "picklist.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\n")

        order = _make_order(session, "TH1003", str(pdf_path))
        service = PrintJobService(session)

        job = service.enqueue_picklist_print(
            order,
            trigger_source="automatic",
            requested_by="ops@example.com",
        )
        session.commit()

        claimed = service.claim_next_pending_job(claim_timeout_seconds=30)
        assert claimed is not None
        session.commit()

        failed = service.mark_failed(job.id, error_message="Printer offline")
        session.commit()
        assert failed.status == "failed"

        requeued = service.enqueue_picklist_print(
            order,
            trigger_source="manual",
            requested_by="admin@example.com",
        )
        session.commit()
        assert requeued.status == "pending"
        assert requeued.trigger_source == "manual"
    finally:
        session.close()
        temp_dir.cleanup()


if __name__ == "__main__":
    test_enqueue_claim_and_complete_cycle()
    print("[PASS] enqueue_claim_and_complete_cycle")
    test_duplicate_pending_jobs_are_blocked()
    print("[PASS] duplicate_pending_jobs_are_blocked")
    test_failed_job_can_be_requeued_manually()
    print("[PASS] failed_job_can_be_requeued_manually")
    print("[SUCCESS] Print job service tests passed")
