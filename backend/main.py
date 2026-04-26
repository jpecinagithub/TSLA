import logging
import logging.config
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import LOG_LEVEL
from db.connection import check_connection
from api.routes import trades, signals, portfolio, parameters, performance, bars
from api.websocket import router as ws_router
from scheduler.loop import tick, reset_daily_counters

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="America/New_York")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not check_connection():
        logger.error("Cannot connect to MySQL — check config")
    else:
        logger.info("MySQL connection OK")

    # Every minute during market hours
    scheduler.add_job(tick, "cron", day_of_week="mon-fri",
                      hour="9-15", minute="*", second=0)
    # Reset daily counters at 09:30 ET
    scheduler.add_job(reset_daily_counters, "cron",
                      day_of_week="mon-fri", hour=9, minute=30)
    scheduler.start()
    logger.info("Scheduler started")

    yield

    scheduler.shutdown()
    logger.info("Scheduler stopped")


app = FastAPI(title="TSLA Trading Agent", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bars.router)
app.include_router(trades.router)
app.include_router(signals.router)
app.include_router(portfolio.router)
app.include_router(parameters.router)
app.include_router(performance.router)
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"status": "ok", "db": check_connection()}
