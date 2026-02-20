import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
from app.config import settings

database_url = settings.database_url


def _get_env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return int(str(raw_value).strip())
    except (TypeError, ValueError):
        return default

# SQLite does not support the MySQL connection pool arguments used in production.
if str(database_url).strip().lower().startswith("sqlite"):
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )
else:
    # SQLAlchemy pools are per-process. Keep defaults conservative for shared
    # MySQL users (e.g., dev + prod on PythonAnywhere).
    pool_size = _get_env_int("DB_POOL_SIZE", 1)
    max_overflow = _get_env_int("DB_MAX_OVERFLOW", 0)
    pool_recycle = _get_env_int("DB_POOL_RECYCLE", 3600)
    pool_timeout = _get_env_int("DB_POOL_TIMEOUT", 10)

    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_recycle=pool_recycle,  # MySQL connection timeout handling
        pool_timeout=pool_timeout,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


@contextmanager
def get_db():
    """Context manager for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session():
    """Get a database session directly (caller responsible for closing)"""
    return SessionLocal()
