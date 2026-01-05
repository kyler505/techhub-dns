from contextlib import contextmanager
from app.database import SessionLocal


@contextmanager
def get_database():
    """Context manager for database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
