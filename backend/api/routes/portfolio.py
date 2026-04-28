from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import Portfolio, Trade
from sqlalchemy import func

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("")
def get_portfolio(
    strategy: str = Query(default="ema_crossover"),
    db: Session = Depends(get_db),
):
    p = db.query(Portfolio).filter(Portfolio.strategy == strategy).first()
    total_trades = db.query(func.count(Trade.id)).filter(
        Trade.status == "CLOSED", Trade.strategy == strategy
    ).scalar()
    winning = db.query(func.count(Trade.id)).filter(
        Trade.status == "CLOSED", Trade.strategy == strategy, Trade.net_pnl > 0
    ).scalar()
    win_rate = round(winning / total_trades * 100, 1) if total_trades else 0

    return {
        "capital":          float(p.capital),
        "initial_capital":  float(p.initial_capital),
        "realized_pnl":     float(p.realized_pnl),
        "daily_pnl":        float(p.daily_pnl),
        "daily_loss_halt":  bool(p.daily_loss_halt),
        "pnl_pct":          round((float(p.capital) - float(p.initial_capital)) / float(p.initial_capital) * 100, 2),
        "total_trades":     total_trades,
        "win_rate":         win_rate,
        "last_updated":     p.last_updated,
    }


@router.get("/all")
def get_all_portfolios(db: Session = Depends(get_db)):
    """Returns portfolio summary for all 3 strategies — used by the Comparison page."""
    strategies = ["ema_crossover", "momentum_breakout", "vwap_momentum"]
    result = []
    for strat in strategies:
        p = db.query(Portfolio).filter(Portfolio.strategy == strat).first()
        if not p:
            continue
        total_trades = db.query(func.count(Trade.id)).filter(
            Trade.status == "CLOSED", Trade.strategy == strat
        ).scalar()
        winning = db.query(func.count(Trade.id)).filter(
            Trade.status == "CLOSED", Trade.strategy == strat, Trade.net_pnl > 0
        ).scalar()
        win_rate = round(winning / total_trades * 100, 1) if total_trades else 0
        result.append({
            "strategy":         strat,
            "capital":          float(p.capital),
            "initial_capital":  float(p.initial_capital),
            "realized_pnl":     float(p.realized_pnl),
            "daily_pnl":        float(p.daily_pnl),
            "pnl_pct":          round((float(p.capital) - float(p.initial_capital)) / float(p.initial_capital) * 100, 2),
            "total_trades":     total_trades,
            "win_rate":         win_rate,
        })
    return result
