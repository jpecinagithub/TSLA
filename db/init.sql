-- TSLA Trading Agent — MySQL 8 schema

CREATE DATABASE IF NOT EXISTS tsla_trader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tsla_trader;

-- 1-minute OHLCV bars from yfinance
CREATE TABLE IF NOT EXISTS bars (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    ts          DATETIME(3) NOT NULL,
    open        DECIMAL(10,4) NOT NULL,
    high        DECIMAL(10,4) NOT NULL,
    low         DECIMAL(10,4) NOT NULL,
    close       DECIMAL(10,4) NOT NULL,
    volume      BIGINT NOT NULL,
    ema9        DECIMAL(10,4),
    ema21       DECIMAL(10,4),
    rsi14       DECIMAL(6,3),
    vwap        DECIMAL(10,4),
    vol_ratio   DECIMAL(6,3),
    UNIQUE KEY uq_ts (ts)
) ENGINE=InnoDB;

-- Every signal the strategy engine evaluates
CREATE TABLE IF NOT EXISTS signals (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    ts              DATETIME(3) NOT NULL,
    signal_type     ENUM('BUY','SELL','HOLD') NOT NULL,
    price           DECIMAL(10,4) NOT NULL,
    ema9            DECIMAL(10,4),
    ema21           DECIMAL(10,4),
    rsi14           DECIMAL(6,3),
    vwap            DECIMAL(10,4),
    vol_ratio       DECIMAL(6,3),
    risk_pass       TINYINT(1) NOT NULL DEFAULT 0,
    risk_reason     VARCHAR(255),
    action_taken    ENUM('EXECUTED','SKIPPED','BLOCKED') NOT NULL,
    reason          VARCHAR(255),
    INDEX idx_ts (ts),
    INDEX idx_type (signal_type)
) ENGINE=InnoDB;

-- Completed trades (closed positions)
CREATE TABLE IF NOT EXISTS trades (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    entry_ts        DATETIME(3) NOT NULL,
    exit_ts         DATETIME(3),
    entry_price     DECIMAL(10,4) NOT NULL,
    exit_price      DECIMAL(10,4),
    shares          DECIMAL(10,6) NOT NULL,
    gross_pnl       DECIMAL(10,4),
    slippage        DECIMAL(10,4),
    net_pnl         DECIMAL(10,4),
    exit_reason     ENUM('TARGET','STOP_LOSS','REVERSAL','FLATTEN','MANUAL'),
    status          ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
    INDEX idx_entry_ts (entry_ts),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Current portfolio snapshot (single row, upserted each cycle)
CREATE TABLE IF NOT EXISTS portfolio (
    id              INT PRIMARY KEY DEFAULT 1,
    capital         DECIMAL(12,4) NOT NULL,
    initial_capital DECIMAL(12,4) NOT NULL,
    realized_pnl    DECIMAL(12,4) NOT NULL DEFAULT 0,
    daily_pnl       DECIMAL(12,4) NOT NULL DEFAULT 0,
    daily_loss_halt TINYINT(1) NOT NULL DEFAULT 0,
    last_updated    DATETIME(3) NOT NULL
) ENGINE=InnoDB;

-- Strategy parameters (editable via dashboard)
CREATE TABLE IF NOT EXISTS parameters (
    key_name    VARCHAR(64) PRIMARY KEY,
    value       VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- Audit trail for parameter changes
CREATE TABLE IF NOT EXISTS param_audit (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    ts          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    key_name    VARCHAR(64) NOT NULL,
    old_value   VARCHAR(255),
    new_value   VARCHAR(255) NOT NULL,
    INDEX idx_ts (ts)
) ENGINE=InnoDB;

-- Default strategy parameters
INSERT INTO parameters (key_name, value, description) VALUES
  ('ema_fast',          '9',     'Fast EMA period'),
  ('ema_slow',          '21',    'Slow EMA period'),
  ('rsi_period',        '14',    'RSI period'),
  ('rsi_overbought',    '70',    'RSI overbought threshold'),
  ('rsi_oversold',      '30',    'RSI oversold threshold'),
  ('vol_spike_mult',    '1.5',   'Volume spike multiplier vs 20-bar avg'),
  ('profit_target_pct', '0.5',   'Profit target % per trade'),
  ('stop_loss_pct',     '0.3',   'Stop loss % per trade'),
  ('max_risk_pct',      '1.0',   'Max capital at risk per trade %'),
  ('max_daily_loss_pct','3.0',   'Max daily loss % before halt'),
  ('max_trades_day',    '10',    'Max round-trips per day'),
  ('slippage_pct',      '0.05',  'Estimated slippage % per fill')
ON DUPLICATE KEY UPDATE key_name = key_name;

-- Seed initial portfolio
INSERT INTO portfolio (id, capital, initial_capital, realized_pnl, daily_pnl, last_updated)
VALUES (1, 5000.00, 5000.00, 0.00, 0.00, NOW(3))
ON DUPLICATE KEY UPDATE last_updated = last_updated;
