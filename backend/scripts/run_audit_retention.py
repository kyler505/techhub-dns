"""
Run manual system audit log retention maintenance.

Usage:
    cd backend
    python scripts/run_audit_retention.py
    python scripts/run_audit_retention.py --archive-days 90 --retention-days 365 --batch-size 1000
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.services.maintenance_service import apply_system_audit_retention


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run system audit log retention maintenance")
    parser.add_argument("--archive-days", type=int, default=None, help="Days to keep in hot table")
    parser.add_argument("--retention-days", type=int, default=None, help="Days to keep in archive")
    parser.add_argument("--batch-size", type=int, default=None, help="Batch size for move/delete operations")
    return parser.parse_args()


def _resolve_cutoff(days: Optional[int]) -> Optional[int]:
    if days is None:
        return None
    value = int(days)
    if value <= 0:
        raise ValueError("Days must be a positive integer")
    return value


def main() -> None:
    args = _parse_args()
    archive_days = _resolve_cutoff(args.archive_days)
    retention_days = _resolve_cutoff(args.retention_days)
    batch_size = args.batch_size
    archive_cutoff = None
    if archive_days is not None:
        archive_cutoff = datetime.utcnow() - timedelta(days=archive_days)

    db = SessionLocal()
    try:
        result = apply_system_audit_retention(
            db,
            archive_cutoff=archive_cutoff,
            archive_retention_days=retention_days,
            batch_size=batch_size,
        )
        print(
            "Audit retention completed. moved=%s deleted=%s"
            % (result.moved, result.deleted)
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
