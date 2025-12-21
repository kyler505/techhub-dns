from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.api.routes import orders, inflow, teams, audit, delivery_runs
from app.scheduler import start_scheduler
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        scheduler = start_scheduler()
        logger.info("Application started")
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise
    yield
    # Shutdown
    try:
        scheduler.shutdown()
        logger.info("Application shutdown")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


app = FastAPI(
    title="TechHub Delivery Workflow API",
    description="Internal API for managing delivery orders",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(orders.router, prefix="/api")
app.include_router(inflow.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(delivery_runs.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "TechHub Delivery Workflow API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
