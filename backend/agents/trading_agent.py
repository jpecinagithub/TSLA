"""
TradingAgent — encapsulates one complete strategy instance.

Each agent owns:
  - its strategy name (used to partition DB rows)
  - its own open-position state
  - its own prev_snap for cross-bar signal detection
  - its own trades-today counter
  - its own parameters (loaded from DB filtered by strategy)

The scheduler creates one TradingAgent per strategy and calls tick(df) every minute.
"""
import logging
import types
from datetime import datetime, timezone
from typing import Any

from db.connection import SessionLocal
from db.models import Parameter, Portfolio, Signal as SignalModel
from indicators.engine import compute, persist_indicators, IndicatorSnapshot
from risk.manager import validate_buy, validate_sell
from simulator.paper_broker import open_position, close_position

logger = logging.getLogger(__name__)


class TradingAgent:
    """One autonomous trading agent for a single strategy."""

    def __init__(self, strategy: str, strategy_module: types.ModuleType):
        self.strategy        = strategy
        self._module         = strategy_module
        self._open_position: dict | None = None
        self._prev_snap:     IndicatorSnapshot | None = None
        self._trades_today:  int = 0

    # ------------------------------------------------------------------ #
    #  Public interface                                                     #
    # ------------------------------------------------------------------ #

    def tick(self, df) -> None:
        """
        Single execution cycle for this agent.
        df: fresh bar DataFrame (already collected — shared across agents).
        """
        params    = self._load_params()
        portfolio = self._load_portfolio()

        if portfolio["daily_loss_halt"]:
            logger.warning("[%s] Trading halted: daily loss limit reached", self.strategy)
            return

        # 1. Compute indicators (each agent may have different ema_fast/slow)
        df, snap = compute(df, params)
        if snap is None:
            return

        # Persist indicators once — only the ema_crossover agent writes to bars
        # (all strategies share the same bar data; avoid redundant DB writes)
        if self.strategy == "ema_crossover":
            persist_indicators(snap)

        # 2. Force-flatten before end of session
        if self._should_flatten() and self._open_position:
            risk = validate_sell(self._open_position)
            close_position(self._open_position, snap.close, "FLATTEN", params, self.strategy)
            self._log_signal(snap, "SELL", "FLATTEN", risk.approved, risk.reason, "EXECUTED")
            self._open_position = None
            self._prev_snap = snap
            return

        # 3. Strategy evaluation
        result = self._module.evaluate(snap, self._prev_snap, self._open_position, params, df)
        self._prev_snap = snap

        Sig = self._module.Signal

        # 4. Risk validation + execution
        if result.signal == Sig.BUY:
            risk = validate_buy(
                snap.close, portfolio["capital"], portfolio["daily_pnl"],
                self._trades_today, params,
            )
            if risk.approved:
                pos = open_position(snap.close, risk.shares, params, self.strategy)
                if pos:
                    self._open_position = pos
                    self._trades_today += 1
                    self._log_signal(snap, "BUY", result.reason, True, risk.reason, "EXECUTED")
                else:
                    self._log_signal(snap, "BUY", result.reason, True, risk.reason, "SKIPPED")
            else:
                self._log_signal(snap, "BUY", result.reason, False, risk.reason, "BLOCKED")

        elif result.signal == Sig.SELL:
            risk = validate_sell(self._open_position)
            if risk.approved:
                close_position(self._open_position, snap.close, result.reason, params, self.strategy)
                self._open_position = None
                self._log_signal(snap, "SELL", result.reason, True, risk.reason, "EXECUTED")
            else:
                self._log_signal(snap, "SELL", result.reason, False, risk.reason, "BLOCKED")

        else:  # HOLD
            self._log_signal(snap, "HOLD", result.reason, True, "no trade", "SKIPPED")

    def reset_daily(self) -> None:
        """Reset intraday counters and clear the daily PnL/halt flag in DB."""
        self._trades_today = 0
        db = SessionLocal()
        try:
            p = db.query(Portfolio).filter(Portfolio.strategy == self.strategy).first()
            if p:
                p.daily_pnl       = 0
                p.daily_loss_halt = 0
                p.last_updated    = datetime.now(timezone.utc).replace(tzinfo=None)
                db.commit()
        finally:
            db.close()
        logger.info("[%s] Daily counters reset", self.strategy)

    # ------------------------------------------------------------------ #
    #  Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _load_params(self) -> dict:
        db = SessionLocal()
        try:
            rows = db.query(Parameter).filter(Parameter.strategy == self.strategy).all()
            return {r.key_name: r.value for r in rows}
        finally:
            db.close()

    def _load_portfolio(self) -> dict:
        db = SessionLocal()
        try:
            p = db.query(Portfolio).filter(Portfolio.strategy == self.strategy).first()
            return {
                "capital":         float(p.capital),
                "daily_pnl":       float(p.daily_pnl),
                "daily_loss_halt": bool(p.daily_loss_halt),
            }
        finally:
            db.close()

    def _log_signal(
        self,
        snap: IndicatorSnapshot,
        signal_type: str,
        reason: str,
        risk_pass: bool,
        risk_reason: str,
        action: str,
    ) -> None:
        db = SessionLocal()
        try:
            db.add(SignalModel(
                strategy     = self.strategy,
                ts           = snap.ts,
                signal_type  = signal_type,
                price        = snap.close,
                ema9         = snap.ema9,
                ema21        = snap.ema21,
                rsi14        = snap.rsi14,
                vwap         = snap.vwap,
                vol_ratio    = snap.vol_ratio,
                risk_pass    = int(risk_pass),
                risk_reason  = risk_reason,
                action_taken = action,
                reason       = reason,
            ))
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("[%s] _log_signal failed: %s", self.strategy, exc)
        finally:
            db.close()

    @staticmethod
    def _should_flatten() -> bool:
        import pytz
        from config import FLATTEN_BEFORE
        from datetime import time
        ET = pytz.timezone("America/New_York")
        now_et    = datetime.now(ET).time()
        flatten_t = time(*map(int, FLATTEN_BEFORE.split(":")))
        return now_et >= flatten_t
