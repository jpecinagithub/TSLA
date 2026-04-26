"""
Paper Trading Simulator.
Same interface as a future real broker client — Phase 3 is a config swap.
"""
import logging
from datetime import datetime, timezone

from db.connection import SessionLocal
from db.models import Portfolio, Trade

logger = logging.getLogger(__name__)


def _slippage_cost(price: float, shares: float, slippage_pct: float) -> float:
    return price * shares * (slippage_pct / 100)


def open_position(
    price: float,
    shares: float,
    params: dict,
) -> dict:
    """
    Simulate a BUY fill. Deducts cost + slippage from capital.
    Returns the position dict persisted to DB.
    """
    slippage_pct  = float(params.get("slippage_pct", 0.05))
    fill_price    = price  # market order: fill at current price
    slippage_cost = _slippage_cost(fill_price, shares, slippage_pct)
    total_cost    = fill_price * shares + slippage_cost

    db = SessionLocal()
    try:
        portfolio = db.get(Portfolio, 1)
        if portfolio.capital < total_cost:
            logger.warning("Insufficient capital: need %.2f, have %.2f", total_cost, portfolio.capital)
            return {}

        portfolio.capital -= total_cost
        portfolio.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)

        trade = Trade(
            entry_ts    = datetime.now(timezone.utc).replace(tzinfo=None),
            entry_price = fill_price,
            shares      = shares,
            slippage    = slippage_cost,
            status      = "OPEN",
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)

        position = {
            "trade_id":    trade.id,
            "entry_price": float(fill_price),
            "shares":      float(shares),
            "slippage":    slippage_cost,
        }
        logger.info("BUY %.4f shares @ %.4f  (slippage: %.4f)", shares, fill_price, slippage_cost)
        return position

    except Exception as exc:
        db.rollback()
        logger.error("open_position failed: %s", exc)
        return {}
    finally:
        db.close()


def close_position(
    position: dict,
    price: float,
    exit_reason: str,
    params: dict,
) -> dict:
    """
    Simulate a SELL fill. Credits proceeds to capital, records PnL.
    Returns the closed trade dict.
    """
    slippage_pct  = float(params.get("slippage_pct", 0.05))
    fill_price    = price
    shares        = position["shares"]
    entry_price   = position["entry_price"]
    slippage_cost = _slippage_cost(fill_price, shares, slippage_pct)

    gross_pnl = (fill_price - entry_price) * shares
    net_pnl   = gross_pnl - slippage_cost - position.get("slippage", 0)
    proceeds  = fill_price * shares - slippage_cost

    db = SessionLocal()
    try:
        portfolio = db.get(Portfolio, 1)
        portfolio.capital      += proceeds
        portfolio.realized_pnl += net_pnl
        portfolio.daily_pnl    += net_pnl
        portfolio.last_updated  = datetime.now(timezone.utc).replace(tzinfo=None)

        trade = db.get(Trade, position["trade_id"])
        trade.exit_ts    = datetime.now(timezone.utc).replace(tzinfo=None)
        trade.exit_price = fill_price
        trade.gross_pnl  = gross_pnl
        trade.slippage   = (position.get("slippage", 0) + slippage_cost)
        trade.net_pnl    = net_pnl
        trade.exit_reason = exit_reason
        trade.status      = "CLOSED"

        db.commit()

        logger.info(
            "SELL %.4f shares @ %.4f | gross: %.4f | net: %.4f | reason: %s",
            shares, fill_price, gross_pnl, net_pnl, exit_reason,
        )
        return {"net_pnl": net_pnl, "exit_price": fill_price}

    except Exception as exc:
        db.rollback()
        logger.error("close_position failed: %s", exc)
        return {}
    finally:
        db.close()
