#!/usr/bin/env python3
"""
Script to update delivery runs that have empty names with proper generated names.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models.delivery_run import DeliveryRun
from app.services.delivery_run_service import DeliveryRunService

def main():
    try:
        db = SessionLocal()
        service = DeliveryRunService(db)

        # Find runs with empty or null names
        runs_to_update = db.query(DeliveryRun).filter(
            (DeliveryRun.name == '') | (DeliveryRun.name.is_(None))
        ).all()

        print(f"Found {len(runs_to_update)} runs with empty names")

        for run in runs_to_update:
            # Generate a name based on the run's creation time using the service method
            if run.created_at:
                new_name = service.generate_run_name(run.created_at)
                print(f"Updating run {run.id}: '{run.name}' -> '{new_name}'")
                run.name = new_name

        db.commit()
        print(f"Successfully updated {len(runs_to_update)} runs")

        # Show all runs for verification
        all_runs = db.query(DeliveryRun).all()
        print("\nAll delivery runs:")
        for run in all_runs:
            print(f"  {run.id}: '{run.name}' (status: {run.status})")

        db.close()
        print("Done!")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
