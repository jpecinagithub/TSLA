import os
from dotenv import load_dotenv

load_dotenv()

MYSQL_HOST     = os.getenv("MYSQL_HOST", "localhost")
MYSQL_USER     = os.getenv("MYSQL_USER", "trader")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "changeme")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "tsla_trader")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", "3306"))


INITIAL_CAPITAL = float(os.getenv("INITIAL_CAPITAL", "5000.0"))
LOG_LEVEL       = os.getenv("LOG_LEVEL", "INFO")

TICKER           = "TSLA"
BAR_INTERVAL     = "1m"
MARKET_OPEN_ET   = os.getenv("MARKET_OPEN_ET", "09:30")
MARKET_CLOSE_ET  = os.getenv("MARKET_CLOSE_ET", "16:00")
FLATTEN_BEFORE   = os.getenv("FLATTEN_BEFORE_ET", "15:55")

# Alpaca Paper Trading API
ALPACA_API_KEY   = os.getenv("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY", "")
ALPACA_BASE_URL  = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")

DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
    f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
)
