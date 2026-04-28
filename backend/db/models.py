from datetime import datetime
from sqlalchemy import (
    BigInteger, Column, Date, DateTime, Enum, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint
)
from sqlalchemy import PrimaryKeyConstraint
from db.connection import Base


class Bar(Base):
    __tablename__ = "bars"
    id        = Column(BigInteger, primary_key=True, autoincrement=True)
    ts        = Column(DateTime(3), nullable=False, unique=True)
    open      = Column(Numeric(10, 4), nullable=False)
    high      = Column(Numeric(10, 4), nullable=False)
    low       = Column(Numeric(10, 4), nullable=False)
    close     = Column(Numeric(10, 4), nullable=False)
    volume    = Column(BigInteger, nullable=False)
    ema9      = Column(Numeric(10, 4))
    ema21     = Column(Numeric(10, 4))
    rsi14     = Column(Numeric(6, 3))
    vwap      = Column(Numeric(10, 4))
    vol_ratio = Column(Numeric(6, 3))


class Signal(Base):
    __tablename__ = "signals"
    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    strategy     = Column(String(32), nullable=False, default="ema_crossover")
    ts           = Column(DateTime(3), nullable=False)
    signal_type  = Column(Enum("BUY", "SELL", "HOLD"), nullable=False)
    price        = Column(Numeric(10, 4), nullable=False)
    ema9         = Column(Numeric(10, 4))
    ema21        = Column(Numeric(10, 4))
    rsi14        = Column(Numeric(6, 3))
    vwap         = Column(Numeric(10, 4))
    vol_ratio    = Column(Numeric(6, 3))
    risk_pass    = Column(SmallInteger, nullable=False, default=0)
    risk_reason  = Column(String(255))
    action_taken = Column(Enum("EXECUTED", "SKIPPED", "BLOCKED"), nullable=False)
    reason       = Column(String(255))


class Trade(Base):
    __tablename__ = "trades"
    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    strategy     = Column(String(32), nullable=False, default="ema_crossover")
    entry_ts     = Column(DateTime(3), nullable=False)
    exit_ts      = Column(DateTime(3))
    entry_price  = Column(Numeric(10, 4), nullable=False)
    exit_price   = Column(Numeric(10, 4))
    shares       = Column(Numeric(10, 6), nullable=False)
    gross_pnl    = Column(Numeric(10, 4))
    slippage     = Column(Numeric(10, 4))
    net_pnl      = Column(Numeric(10, 4))
    exit_reason  = Column(Enum("TARGET", "STOP_LOSS", "REVERSAL", "FLATTEN", "MANUAL"))
    status       = Column(Enum("OPEN", "CLOSED"), nullable=False, default="OPEN")


class Portfolio(Base):
    __tablename__ = "portfolio"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    strategy         = Column(String(32), nullable=False, default="ema_crossover", unique=True)
    capital          = Column(Numeric(12, 4), nullable=False)
    initial_capital  = Column(Numeric(12, 4), nullable=False)
    realized_pnl     = Column(Numeric(12, 4), nullable=False, default=0)
    daily_pnl        = Column(Numeric(12, 4), nullable=False, default=0)
    daily_loss_halt  = Column(SmallInteger, nullable=False, default=0)
    last_updated     = Column(DateTime(3), nullable=False)


class Parameter(Base):
    __tablename__ = "parameters"
    strategy    = Column(String(32), nullable=False, default="ema_crossover")
    key_name    = Column(String(64), nullable=False)
    value       = Column(String(255), nullable=False)
    description = Column(String(255))
    updated_at  = Column(DateTime(3), nullable=False, default=datetime.utcnow)
    __table_args__ = (PrimaryKeyConstraint("strategy", "key_name"),)


class ParamAudit(Base):
    __tablename__ = "param_audit"
    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    strategy   = Column(String(32), nullable=False, default="ema_crossover")
    ts         = Column(DateTime(3), nullable=False, default=datetime.utcnow)
    key_name   = Column(String(64), nullable=False)
    old_value  = Column(String(255))
    new_value  = Column(String(255), nullable=False)
    changed_by = Column(String(64), nullable=False, default="manual")


class DailyReport(Base):
    __tablename__ = "daily_reports"
    id                   = Column(BigInteger, primary_key=True, autoincrement=True)
    strategy             = Column(String(32), nullable=False, default="ema_crossover")
    report_date          = Column(Date, nullable=False)
    generated_at         = Column(DateTime(3), nullable=False)
    total_signals        = Column(Integer, nullable=False, default=0)
    buy_signals          = Column(Integer, nullable=False, default=0)
    sell_signals         = Column(Integer, nullable=False, default=0)
    trades_opened        = Column(Integer, nullable=False, default=0)
    trades_closed        = Column(Integer, nullable=False, default=0)
    daily_pnl            = Column(Numeric(10, 4), nullable=False, default=0)
    win_count            = Column(Integer, nullable=False, default=0)
    loss_count           = Column(Integer, nullable=False, default=0)
    win_rate             = Column(Numeric(5, 2), nullable=False, default=0)
    analysis_json        = Column(Text)
    recommendations_json = Column(Text)
    param_snapshot_json  = Column(Text)


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    id                  = Column(BigInteger, primary_key=True, autoincrement=True)
    strategy            = Column(String(32), nullable=False, default="ema_crossover")
    run_ts              = Column(DateTime(3), nullable=False)
    bars_used           = Column(Integer, nullable=False, default=0)
    combinations_tested = Column(Integer, nullable=False, default=0)
    best_params_json    = Column(Text, nullable=False)
    baseline_pnl        = Column(Numeric(10, 4))
    best_pnl            = Column(Numeric(10, 4))
    improvement_pct     = Column(Numeric(6, 2))
    applied             = Column(SmallInteger, nullable=False, default=0)
    apply_reason        = Column(Text)
