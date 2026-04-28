import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight, DollarSign, Layers, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import CandleChart from "../components/CandleChart";
import StatCard    from "../components/StatCard";
import { useLive } from "../lib/useLive";
import { api }     from "../lib/api";
import { useStrategy } from "../lib/StrategyContext";

interface Portfolio {
  capital: number; initial_capital: number; realized_pnl: number;
  daily_pnl: number; pnl_pct: number; total_trades: number;
}

interface Condition {
  name:    string;
  passing: boolean;
  detail:  string;
  role:    "entry" | "exit";
}

interface AgentDecision {
  strategy:      string;
  label:         string;
  signal:        "BUY" | "SELL" | "HOLD";
  mode:          "entry" | "exit";
  open_position: { entry_price: number; shares: number; pnl_pct: number } | null;
  conditions:    Condition[];
}

interface LiveDecisions {
  ts:     string;
  close:  number;
  agents: AgentDecision[];
}

const f = (n?: number | null, d = 2) => n != null ? n.toFixed(d) : "—";

const STRATEGY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  ema_crossover:     { color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"   },
  momentum_breakout: { color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20"  },
  vwap_momentum:     { color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
};

const SIGNAL_STYLE: Record<string, string> = {
  BUY:  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  SELL: "bg-rose-500/10    text-rose-400    border border-rose-500/30",
  HOLD: "bg-slate-500/10   text-slate-400   border border-slate-500/20",
};

function AgentCard({ agent }: { agent: AgentDecision }) {
  const style    = STRATEGY_STYLE[agent.strategy] ?? STRATEGY_STYLE.ema_crossover;
  const allPass  = agent.conditions.every(c => c.passing);
  const passCount = agent.conditions.filter(c => c.passing).length;

  return (
    <div className={`surface overflow-hidden border-t-2 ${style.border.replace("border-", "border-t-")}`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2030]">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold tracking-widest uppercase ${style.color}`}>
            {agent.strategy === "ema_crossover" ? "EMA" : agent.strategy === "momentum_breakout" ? "MOM" : "VWAP"}
          </span>
          <span className="text-slate-500 text-[11px]">{agent.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {agent.open_position && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              IN POSITION
            </span>
          )}
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${SIGNAL_STYLE[agent.signal]}`}>
            {agent.signal}
          </span>
        </div>
      </div>

      {/* Open position summary */}
      {agent.open_position && (
        <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-4 text-[11px]">
          <span className="text-slate-500">Entry: <span className="text-white font-mono">${f(agent.open_position.entry_price)}</span></span>
          <span className="text-slate-500">Shares: <span className="text-white font-mono">{f(agent.open_position.shares, 4)}</span></span>
          <span className={`font-semibold font-mono ${agent.open_position.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {agent.open_position.pnl_pct >= 0 ? "+" : ""}{f(agent.open_position.pnl_pct)}%
          </span>
        </div>
      )}

      {/* Mode label */}
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
          {agent.mode === "exit" ? "Exit conditions (any triggers SELL)" : "Entry conditions (all required for BUY)"}
        </span>
      </div>

      {/* Conditions */}
      <div className="px-4 pb-3 flex flex-col gap-1.5">
        {agent.conditions.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            {c.passing
              ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              : <XCircle      size={14} className="text-rose-400    shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] font-medium ${c.passing ? "text-slate-200" : "text-slate-500"}`}>
                {c.name}
              </div>
              <div className="text-[11px] text-slate-600 truncate" title={c.detail}>
                {c.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom summary bar */}
      <div className={`px-4 py-2 flex items-center gap-2 text-[11px] border-t border-[#1a2030] ${
        allPass ? style.bg : "bg-transparent"
      }`}>
        <AlertCircle size={12} className={allPass ? style.color : "text-slate-600"} />
        <span className={allPass ? style.color : "text-slate-600"}>
          {agent.mode === "entry"
            ? allPass
              ? "All conditions met — BUY signal active"
              : `${passCount}/${agent.conditions.length} conditions passing`
            : allPass
              ? "Exit triggered"
              : `${passCount}/${agent.conditions.length} exit conditions met`
          }
        </span>
      </div>

    </div>
  );
}

export default function LiveMonitor() {
  const { strategy } = useStrategy();
  const { data: live } = useLive();

  const { data: port } = useQuery<Portfolio>({
    queryKey: ["portfolio", strategy],
    queryFn:  () => api.get(`/portfolio?strategy=${strategy}`),
    refetchInterval: 15_000,
  });

  const { data: decisions } = useQuery<LiveDecisions>({
    queryKey: ["live-decisions"],
    queryFn:  () => api.get("/live/decisions"),
    refetchInterval: 15_000,
  });

  const dailyUp  = (port?.daily_pnl ?? 0) >= 0;
  const totalUp  = (port?.pnl_pct   ?? 0) >= 0;
  const rsiVal   = live?.rsi14 ?? 0;
  const rsiHot   = rsiVal > 70;
  const rsiCold  = rsiVal < 30;
  const volSpike = (live?.vol_ratio ?? 0) >= 1.5;
  const crossUp  = live?.ema9 != null && live?.ema21 != null && live.ema9 > live.ema21;
  const unrealized = live?.position
    ? (live.close - live.position.entry_price) * live.position.shares : null;

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* ── KPI ROW ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="TSLA Price"
          value={`$${f(live?.close)}`}
          sub={live?.ts ? `Last: ${new Date(live.ts).toLocaleTimeString()}` : "Waiting for market…"}
          icon={<DollarSign size={15} />}
        />
        <StatCard
          label="Capital"
          value={`$${f(port?.capital)}`}
          sub={`Started at $${f(port?.initial_capital)}`}
          icon={<Layers size={15} />}
        />
        <StatCard
          label="Today's PnL"
          value={`${dailyUp ? "+" : ""}$${f(port?.daily_pnl)}`}
          trend={dailyUp ? "up" : "down"}
          sub={`${port?.total_trades ?? 0} trades today`}
          icon={dailyUp ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
        />
        <StatCard
          label="Total Return"
          value={`${totalUp ? "+" : ""}${f(port?.pnl_pct)}%`}
          trend={totalUp ? "up" : "down"}
          sub={`$${f(port?.realized_pnl)} realized`}
          icon={<TrendingUpIcon up={totalUp} />}
        />
      </div>

      {/* ── CHART + INDICATORS ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3">

        {/* Chart */}
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2030]">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">TSLA</span>
              <span className="text-xs text-slate-500">1m · Paper</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-blue-500 inline-block rounded" />EMA 9
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-amber-400 inline-block rounded" />EMA 21
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-violet-400 inline-block rounded opacity-70" />VWAP
              </span>
            </div>
          </div>
          <div className="p-3">
            <CandleChart height={320} />
          </div>
        </div>

        {/* Indicator panel */}
        <div className="flex flex-col gap-3">

          {/* EMA */}
          <div className="surface px-4 py-4 flex flex-col gap-3">
            <div className="label">EMA Crossover</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Fast (9)</div>
                <div className="val-md text-blue-400">{f(live?.ema9)}</div>
              </div>
              <div className="text-[11px] text-slate-600">vs</div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 mb-0.5">Slow (21)</div>
                <div className="val-md text-amber-400">{f(live?.ema21)}</div>
              </div>
            </div>
            <div className={`flex items-center gap-2 text-[12px] font-medium px-3 py-2 rounded-lg ${
              crossUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
            }`}>
              {crossUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {crossUp ? "Bullish — EMA9 above EMA21" : "Bearish — EMA9 below EMA21"}
            </div>
          </div>

          {/* RSI */}
          <div className="surface px-4 py-4 flex flex-col gap-3">
            <div className="label">RSI (14)</div>
            <div className={`val-lg ${rsiHot ? "text-rose-400" : rsiCold ? "text-emerald-400" : "text-white"}`}>
              {f(rsiVal, 1)}
            </div>
            <div className="relative h-2 bg-[#1a2030] rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                  rsiHot ? "bg-rose-500" : rsiCold ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(rsiVal, 100)}%` }}
              />
              <div className="absolute top-0 h-full w-px bg-amber-500/40" style={{ left: "70%" }} />
              <div className="absolute top-0 h-full w-px bg-amber-500/40" style={{ left: "30%" }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Oversold 30</span>
              <span className={rsiHot ? "text-rose-400 font-medium" : rsiCold ? "text-emerald-400 font-medium" : ""}>
                {rsiHot ? "Overbought" : rsiCold ? "Oversold" : "Neutral"}
              </span>
              <span>Overbought 70</span>
            </div>
          </div>

          {/* Volume + VWAP */}
          <div className="surface px-4 py-4 flex flex-col gap-3">
            <div className="label">Volume & VWAP</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Vol Ratio</div>
                <div className={`val-md ${volSpike ? "text-emerald-400" : "text-white"}`}>
                  {f(live?.vol_ratio, 2)}×
                </div>
                {volSpike && <div className="text-[11px] text-emerald-400 mt-0.5">Spike detected</div>}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 mb-0.5">VWAP</div>
                <div className="val-md text-violet-400">${f(live?.vwap)}</div>
                {live?.vwap != null && live?.close != null && (
                  <div className={`text-[11px] mt-0.5 ${live.close >= live.vwap ? "text-emerald-400" : "text-rose-400"}`}>
                    {live.close >= live.vwap ? "↑ Above" : "↓ Below"}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── OPEN POSITION (primary agent) ── */}
      {live?.position ? (
        <div className="surface-2 overflow-hidden border-l-2 border-l-amber-500">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2030]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-sm font-semibold text-white">Open Position</span>
            </div>
            <span className="pill-amber">LONG</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a2030]">
            {[
              { label: "Entry Price",    value: `$${f(live.position.entry_price)}`, color: "" },
              { label: "Current Price",  value: `$${f(live.close)}`,                color: "" },
              { label: "Shares",         value: String(live.position.shares),        color: "" },
              { label: "Unrealized PnL", value: `${(unrealized ?? 0) >= 0 ? "+" : ""}$${f(unrealized)}`,
                color: (unrealized ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111520] px-5 py-4">
                <div className="label mb-2">{label}</div>
                <div className={`val-md ${color || "text-white"}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="surface px-5 py-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-slate-700" />
          <span className="text-slate-500 text-sm">No open position — watching for entry signal</span>
        </div>
      )}

      {/* ── AGENT DECISION STATUS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Agent Decision Status</h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Real-time condition breakdown for each strategy
              {decisions?.ts && ` · ${new Date(decisions.ts).toLocaleTimeString()}`}
            </p>
          </div>
        </div>

        {!decisions || decisions.agents.length === 0 ? (
          <div className="surface px-5 py-8 text-center text-slate-600 text-sm">
            No indicator data yet — agent decisions will appear once the market opens and bars accumulate
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {decisions.agents.map(agent => (
              <AgentCard key={agent.strategy} agent={agent} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function TrendingUpIcon({ up }: { up: boolean }) {
  return up
    ? <ArrowUpRight size={15} className="text-emerald-400" />
    : <ArrowDownRight size={15} className="text-rose-400" />;
}
