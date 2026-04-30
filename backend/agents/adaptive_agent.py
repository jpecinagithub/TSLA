"""
Adaptive Trading Agent.

Selects the optimal strategy each tick based on the current market regime:
  TRENDING_UP   → ema_crossover   (trend-following momentum)
  RANGING       → vwap_momentum   (mean-reversion around VWAP)
  TRENDING_DOWN → no trades       (capital preservation)
  UNKNOWN       → no trades       (insufficient data)

Runs as a 4th portfolio alongside the 3 individual strategies,
enabling direct comparison: does regime-switching beat any single strategy?

Signal reason format: "[REGIME→sub_strategy] detail"
  e.g. "[RANGING→vwap_momentum] VWAP cross + vol spike"
  e.g. "[TRENDING_DOWN] regime=TRENDING_DOWN — sitting out"
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timezone

import pytz

from db.connection import SessionLocal
from db.models import Parameter, Portfolio, Signal as SignalModel
from indicators.engine import compute, IndicatorSnapshot
from learning.regime import detect as detect_regime
from risk.manager import validate_buy, validate_sell
from simulator.paper_broker import open_position, close_position
import strategy.ema_crossover as ema_strategy
import strategy.vwap_momentum  as vwap_strategy

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

# Regime → (param_source, strategy_module) | None = sit out
REGIME_MAP: dict[str, tuple[str, object] | None] = {
    "TRENDING_UP":   ("ema_crossover", ema_strategy),
    "RANGING":       ("vwap_momentum", vwap_strategy),
    "TRENDING_DOWN": None,
    "UNKNOWN":       None,
}


class AdaptiveAgent:
    """
    Adaptive trading agent: picks the best strategy each tick
    based on ADX + EMA50 market regime classification.
    """

    strategy = "adaptive"

    def __init__(self):
        self._open_position: dict | None = None
        self._prev_snap:     IndicatorSnapshot | None = None
        self._trades_today:  int = 0
        self._active_sub:    str | None = None   # current sub-strategy name

    # ── Public ──────────────────────────────────────────────────────────

    def tick(self, df) -> None:
        """Single execution cycle. Called every 60s by the scheduler."""
        portfolio = self._load_portfolio()
        if portfolio["daily_loss_halt"]:
            logger.warning("[adaptive] Halted: daily loss limit reached")
            return

        # 1. Detect current regime from the shared bar DataFrame
        regime_snap = detect_regime(df)
        regime      = regime_snap.regime if regime_snap else "UNKNOWN"
        sub         = REGIME_MAP.get(regime)

        # 2. Load params from the active sub-strategy (or ema_crossover as fallback)
        param_src = sub[0] if sub else "ema_crossover"
        params    = self._load_params(param_src)

        # 3. Compute indicators
        df, snap = compute(df, params)
        if snap is None:
            return

        # 4. Force-flatten before end of session (ignores regime)
        if self._should_flatten() and self._open_position:
            close_position(self._open_position, snap.close, "FLATTEN", params, self.strategy)
            self._log(snap, "SELL", "FLATTEN — end of session",
                      True, "flatten", "EXECUTED", regime, self._active_sub)
            self._open_position = None
            self._prev_snap     = snap
            self._active_sub    = None
            return

        # 5. No strategy for this regime → sit out, exit if holding
        if sub is None:
            if self._open_position:
                close_position(self._open_position, snap.close, "FLATTEN", params, self.strategy)
                self._log(snap, "SELL", f"regime={regime} — no strategy, exiting",
                          True, "regime_exit", "EXECUTED", regime, self._active_sub)
                self._open_position = None
                self._active_sub    = None
            else:
                self._log(snap, "HOLD", f"regime={regime} — sitting out",
                          True, "no_trade", "SKIPPED", regime, None)
            self._prev_snap = snap
            return

        sub_name, sub_module = sub

        # 6. Regime switch with open position → close before changing strategy
        if self._open_position and self._active_sub and self._active_sub != sub_name:
            close_position(self._open_position, snap.close, "FLATTEN", params, self.strategy)
            self._log(snap, "SELL",
                      f"regime switch: {self._active_sub} → {sub_name}",
                      True, "regime_switch", "EXECUTED", regime, self._active_sub)
            self._open_position = None
            self._active_sub    = None

        # 7. Evaluate using the active sub-strategy
        result = sub_module.evaluate(snap, self._prev_snap, self._open_position, params, df)
        self._prev_snap  = snap
        self._active_sub = sub_name

        Sig = sub_module.Signal
        tag = f"[{regime}→{sub_name}]"

        # 8. Risk validation + execution
        if result.signal == Sig.BUY:
            risk = validate_buy(
                snap.close, portfolio["capital"],
                portfolio["daily_pnl"], self._trades_today, params,
            )
            reason_str = f"{tag} {result.reason}"
            if risk.approved:
                pos = open_position(snap.close, risk.shares, params, self.strategy)
                if pos:
                    self._open_position = pos
                    self._trades_today += 1
                    self._log(snap, "BUY", reason_str, True, risk.reason, "EXECUTED", regime, sub_name)
                else:
                    self._log(snap, "BUY", reason_str, True, risk.reason, "SKIPPED", regime, sub_name)
            else:
                self._log(snap, "BUY", reason_str, False, risk.reason, "BLOCKED", regime, sub_name)

        elif result.signal == Sig.SELL:
            if self._open_position:
                risk = validate_sell(self._open_position)
                reason_str = f"{tag} {result.reason}"
                if risk.approved:
                    close_position(self._open_position, snap.close,
                                   result.reason, params, self.strategy)
                    self._open_position = None
                    self._log(snap, "SELL", reason_str, True, risk.reason, "EXECUTED", regime, sub_name)
                else:
                    self._log(snap, "SELL", reason_str, False, risk.reason, "BLOCKED", regime, sub_name)
            else:
                self._log(snap, "HOLD", f"{tag} SELL but no position",
                          True, "no_position", "SKIPPED", regime, sub_name)

        else:  # HOLD
            self._log(snap, "HOLD", f"{tag} {result.reason}",
                      True, "no_trade", "SKIPPED", regime, sub_name)

    def reset_daily(self) -> None:
        """Reset intraday counters + clear daily PnL / halt flag in DB."""
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
        logger.info("[adaptive] Daily counters reset")

    # ── Private ─────────────────────────────────────────────────────────

    def _load_params(self, source: str) -> dict:
        """Load params from the given strategy's parameter table."""
        db = SessionLocal()
        try:
            rows = db.query(Parameter).filter(Parameter.strategy == source).all()
            if not rows:
                # Fallback to ema_crossover defaults
                rows = db.query(Parameter).filter(
                    Parameter.strategy == "ema_crossover"
                ).all()
            return {r.key_name: r.value for r in rows}
        finally:
            db.close()

    def _load_portfolio(self) -> dict:
        db = SessionLocal()
        try:
            p = db.query(Portfolio).filter(Portfolio.strategy == self.strategy).first()
            if p is None:
                logger.error("[adaptive] No portfolio row found! Using defaults.")
                return {"capital": 5000.0, "daily_pnl": 0.0, "daily_loss_halt": False}
            return {
                "capital":         float(p.capital),
                "daily_pnl":       float(p.daily_pnl),
                "daily_loss_halt": bool(p.daily_loss_halt),
            }
        finally:
            db.close()

    def _log(
        self,
        snap: IndicatorSnapshot,
        signal_type: str,
        reason: str,
        risk_pass: bool,
        risk_reason: str,
        action: str,
        regime: str,
        sub: str | None,
    ) -> None:
        logger.info("[adaptive][%s][%s→%s] %s → %s | %s",
                    signal_type, regime, sub or "NONE", reason, action, risk_reason)
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
                risk_reason  = risk_reason[:255],
                action_taken = action,
                reason       = reason[:255],
            ))
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("[adaptive] _log failed: %s", exc)
        finally:
            db.close()

    @staticmethod
    def _should_flatten() -> bool:
        from config import FLATTEN_BEFORE
        now_et    = datetime.now(ET).time()
        flatten_t = time(*map(int, FLATTEN_BEFORE.split(":")))
        return now_et >= flatten_t
