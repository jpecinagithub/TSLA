import logging
import logging.config
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import LOG_LEVEL
from db.connection import check_connection
from api.routes import trades, signals, portfolio, parameters, performance, bars, reports, optimizer as optimizer_routes
from api.routes.live_decisions import router as live_decisions_router
from api.routes.backtest import router as backtest_router
from api.websocket import router as ws_router
from scheduler.loop import tick, reset_daily_counters, run_daily_analysis_job, run_optimizer_job

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
    # End-of-day analysis at 16:05 ET
    scheduler.add_job(run_daily_analysis_job, "cron",
                      day_of_week="mon-fri", hour=16, minute=5)
    # Parameter optimizer at 16:10 ET (after analysis)
    scheduler.add_job(run_optimizer_job, "cron",
                      day_of_week="mon-fri", hour=16, minute=10)
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
app.include_router(reports.router)
app.include_router(optimizer_routes.router)
app.include_router(live_decisions_router)
app.include_router(backtest_router)
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"status": "ok", "db": check_connection()}
