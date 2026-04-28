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
    strategy: str = "ema_crossover",
) -> dict:
    """
    Simulate a BUY fill. Deducts cost + slippage from the strategy's capital.
    Returns the position dict persisted to DB, or {} on failure.
    """
    slippage_pct  = float(params.get("slippage_pct", 0.05))
    fill_price    = price
    slippage_cost = _slippage_cost(fill_price, shares, slippage_pct)
    # Round to 4 decimal places to match MySQL DECIMAL(12,4) precision.
    # Without this, floating-point arithmetic can produce a total_cost
    # fractionally above capital (e.g. $5000.0001 vs $5000.0000) even
    # when the risk manager calculated shares to fit exactly within capital.
    total_cost    = round(fill_price * shares + slippage_cost, 4)

    db = SessionLocal()
    try:
        portfolio = db.query(Portfolio).filter(Portfolio.strategy == strategy).first()
        if portfolio is None:
            logger.error("No portfolio row found for strategy '%s'", strategy)
            return {}
        if portfolio.capital < total_cost:
            logger.warning(
                "[%s] Insufficient capital: need %.2f, have %.2f",
                strategy, total_cost, portfolio.capital,
            )
            return {}

        portfolio.capital -= total_cost
        portfolio.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)

        trade = Trade(
            strategy    = strategy,
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
        logger.info("[%s] BUY %.4f shares @ %.4f  (slippage: %.4f)", strategy, shares, fill_price, slippage_cost)
        return position

    except Exception as exc:
        db.rollback()
        logger.error("[%s] open_position failed: %s", strategy, exc)
        return {}
    finally:
        db.close()


def close_position(
    position: dict,
    price: float,
    exit_reason: str,
    params: dict,
    strategy: str = "ema_crossover",
) -> dict:
    """
    Simulate a SELL fill. Credits proceeds to the strategy's capital, records PnL.
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
        portfolio = db.query(Portfolio).filter(Portfolio.strategy == strategy).first()
        if portfolio is None:
            logger.error("No portfolio row found for strategy '%s'", strategy)
            return {}

        portfolio.capital      += proceeds
        portfolio.realized_pnl += net_pnl
        portfolio.daily_pnl    += net_pnl
        portfolio.last_updated  = datetime.now(timezone.utc).replace(tzinfo=None)

        trade = db.get(Trade, position["trade_id"])
        trade.exit_ts     = datetime.now(timezone.utc).replace(tzinfo=None)
        trade.exit_price  = fill_price
        trade.gross_pnl   = gross_pnl
        trade.slippage    = position.get("slippage", 0) + slippage_cost
        trade.net_pnl     = net_pnl
        trade.exit_reason = exit_reason
        trade.status      = "CLOSED"

        db.commit()

        logger.info(
            "[%s] SELL %.4f shares @ %.4f | gross: %.4f | net: %.4f | reason: %s",
            strategy, shares, fill_price, gross_pnl, net_pnl, exit_reason,
        )
        return {"net_pnl": net_pnl, "exit_price": fill_price}

    except Exception as exc:
        db.rollback()
        logger.error("[%s] close_position failed: %s", strategy, exc)
        return {}
    finally:
        db.close()
