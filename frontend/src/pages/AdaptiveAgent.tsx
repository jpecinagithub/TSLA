import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Brain, TrendingUp, TrendingDown, Minus, AlertCircle,
  Zap, Activity, BarChart2,
} from "lucide-react";
import { api } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Regime {
  regime: string; confidence: string;
  adx: number | null; ema50: number | null; price: number;
  recommended_strategy: string | null; ts: string;
}
interface LearningStatus {
  regime: Regime;
  current_week: {
    week_start: string; total_trades: number;
    win_rate: number | null; profit_factor: number | null;
    expectancy: number | null; agent_pnl: number | null;
    bnh_pnl: number | null; alpha: number | null;
  } | null;
  strategy_filter: string;
}
interface Portfolio {
  capital: number; initial_capital: number;
  realized_pnl: number; daily_pnl: number;
  pnl_pct: number; total_trades: number; win_rate: number;
}
interface PerfRow {
  total_trades: number; win_rate: number; profit_factor: number | null;
  avg_win: number; avg_loss: number; total_pnl: number; max_drawdown: number;
  equity_curve: { ts: string; cumulative_pnl: number }[];
}
interface Signal {
  id: number; ts: string; signal_type: string;
  price: number; action_taken: string; reason: string;
  risk_pass: number; risk_reason: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const f  = (n: number | null | undefined, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const sgn = (n: number | null | undefined) => (n != null && n >= 0) ? "+" : "";

const APEX = {
  chart:   { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme:   { mode: "dark" as const },
  grid:    { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

// ── Regime metadata ───────────────────────────────────────────────────────────
const REGIME_META: Record<string, {
  label: string; color: string; bg: string; border: string;
  Icon: typeof TrendingUp; strategy: string; stratColor: string;
}> = {
  TRENDING_UP:   {
    label: "Trending Up",    color: "text-emerald-400", bg: "bg-emerald-500/10",
    border: "border-emerald-500/30", Icon: TrendingUp,
    strategy: "EMA Crossover", stratColor: "text-blue-400",
  },
  TRENDING_DOWN: {
    label: "Trending Down",  color: "text-rose-400",    bg: "bg-rose-500/10",
    border: "border-rose-500/30",    Icon: TrendingDown,
    strategy: "Sitting out",   stratColor: "text-slate-500",
  },
  RANGING:       {
    label: "Ranging",        color: "text-amber-400",   bg: "bg-amber-500/10",
    border: "border-amber-500/30",   Icon: Minus,
    strategy: "VWAP Momentum", stratColor: "text-violet-400",
  },
  UNKNOWN:       {
    label: "Unknown",        color: "text-slate-400",   bg: "bg-slate-500/10",
    border: "border-slate-500/30",   Icon: AlertCircle,
    strategy: "Sitting out",   stratColor: "text-slate-500",
  },
};

// ── Regime Banner ─────────────────────────────────────────────────────────────
function RegimeBanner({ regime }: { regime: Regime }) {
  const meta   = REGIME_META[regime.regime] ?? REGIME_META.UNKNOWN;
  const { Icon } = meta;

  return (
    <div className={`rounded-xl border px-6 py-5 ${meta.bg} ${meta.border}`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl grid place-items-center ${meta.bg} border ${meta.border}`}>
            <Icon size={26} className={meta.color} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Market Regime</div>
            <div className={`text-2xl font-bold ${meta.color}`}>{meta.label}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Confidence: <span className={`font-semibold ${meta.color}`}>{regime.confidence}</span>
              {" "}· ADX <span className="font-mono text-white">{f(regime.adx, 1)}</span>
              {" "}· EMA50 <span className="font-mono text-blue-400">{f(regime.ema50)}</span>
            </div>
          </div>
        </div>

        {/* Active strategy */}
        <div className="text-right">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Active Strategy</div>
          <div className={`text-xl font-bold ${meta.stratColor}`}>{meta.strategy}</div>
          <div className="text-[11px] text-slate-600 mt-0.5">
            Price <span className="font-mono text-white">${f(regime.price)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Equity Curve ──────────────────────────────────────────────────────────────
function EquityChart({ curve }: { curve: { ts: string; cumulative_pnl: number }[] }) {
  if (curve.length === 0)
    return <div className="py-10 text-center text-slate-600 text-sm">No trades yet</div>;

  const last  = curve[curve.length - 1].cumulative_pnl;
  const color = last >= 0 ? "#10b981" : "#f43f5e";

  return (
    <ReactApexChart
      type="area" height={180}
      series={[{ name: "Cumulative PnL", data: curve.map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl })) }]}
      options={{
        ...APEX,
        colors: [color],
        fill:   { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02 } },
        stroke: { curve: "smooth", width: 2 },
        xaxis:  { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:  { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
        annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1, strokeDashArray: 4 }] },
        dataLabels: { enabled: false },
      }}
    />
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────
function SignalRow({ s }: { s: Signal }) {
  const isBuy  = s.signal_type === "BUY";
  const isSell = s.signal_type === "SELL";
  const executed = s.action_taken === "EXECUTED";

  // Extract regime/sub-strategy from reason: "[RANGING→vwap_momentum] ..."
  const match  = s.reason.match(/^\[([^\]]+)\]/);
  const tag    = match ? match[1] : null;
  const detail = match ? s.reason.slice(match[0].length).trim() : s.reason;

  const tsET = new Date(s.ts + "Z").toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit",
  });

  return (
    <tr className="tr">
      <td className="td font-mono text-[11px] text-slate-500 whitespace-nowrap">{tsET} ET</td>
      <td className="td">
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded
          ${isBuy ? "bg-emerald-500/15 text-emerald-400" :
            isSell ? "bg-rose-500/15 text-rose-400" : "text-slate-600"}`}>
          {s.signal_type}
        </span>
      </td>
      <td className="td font-mono text-[12px] text-white">${f(s.price)}</td>
      <td className="td">
        {tag && (
          <span className="text-[10px] font-mono bg-[#1a2235] text-slate-400 border border-[#1e2535]
                           px-1.5 py-0.5 rounded whitespace-nowrap">
            {tag}
          </span>
        )}
      </td>
      <td className="td text-[11px] text-slate-500 max-w-[200px] truncate">{detail}</td>
      <td className="td">
        <span className={`text-[10px] font-semibold
          ${executed ? "text-emerald-400" : "text-slate-600"}`}>
          {s.action_taken}
        </span>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdaptiveAgent() {
  const { data: status } = useQuery<LearningStatus>({
    queryKey: ["learning-status-adaptive"],
    queryFn:  () => api.get("/learning/status?strategy=adaptive"),
    refetchInterval: 30_000,
  });

  const { data: port } = useQuery<Portfolio>({
    queryKey: ["portfolio", "adaptive"],
    queryFn:  () => api.get("/portfolio?strategy=adaptive"),
    refetchInterval: 15_000,
  });

  const { data: perf } = useQuery<PerfRow>({
    queryKey: ["performance", "adaptive"],
    queryFn:  () => api.get("/performance?strategy=adaptive"),
    refetchInterval: 60_000,
  });

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["signals", "adaptive"],
    queryFn:  () => api.get("/signals?strategy=adaptive&limit=40"),
    refetchInterval: 30_000,
  });

  const cw  = status?.current_week;
  const pnlUp  = (port?.realized_pnl ?? 0) >= 0;
  const dayUp  = (port?.daily_pnl ?? 0) >= 0;
  const alphaUp = (cw?.alpha ?? 0) >= 0;

  // Recent signals: only BUY/SELL + executed first, then last 20
  const recentSignals = signals
    .slice()
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 25);

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain size={18} className="text-emerald-400" />
        <div>
          <h1 className="text-base font-bold text-white">Adaptive Agent</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Selects the optimal strategy each minute based on market regime (ADX + EMA50)
          </p>
        </div>
      </div>

      {/* Regime banner */}
      {status && <RegimeBanner regime={status.regime} />}

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Capital",      val: `$${f(port?.capital)}`,      color: "text-white",         Icon: Activity   },
          { label: "Total PnL",    val: `${sgn(port?.realized_pnl)}$${f(port?.realized_pnl)}`, color: pnlUp ? "text-emerald-400" : "text-rose-400", Icon: BarChart2 },
          { label: "Today's PnL", val: `${sgn(port?.daily_pnl)}$${f(port?.daily_pnl)}`,       color: dayUp ? "text-emerald-400" : "text-rose-400", Icon: TrendingUp },
          { label: "Total Trades", val: String(port?.total_trades ?? "—"),  color: "text-white",         Icon: Zap        },
        ].map(({ label, val, color, Icon }) => (
          <div key={label} className="surface px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1a2235] grid place-items-center shrink-0">
              <Icon size={16} className="text-slate-400" />
            </div>
            <div>
              <div className="label mb-0.5">{label}</div>
              <div className={`text-base font-bold font-mono ${color}`}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats + this week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* All-time stats */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">All-time Performance</span>
          </div>
          <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[12px]">
            {[
              { label: "Win Rate",       val: `${f(perf?.win_rate, 1)}%`,   color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
              { label: "Profit Factor",  val: f(perf?.profit_factor),        color: (perf?.profit_factor ?? 0) >= 1 ? "text-emerald-400" : "text-rose-400" },
              { label: "Avg Win",        val: `+$${f(perf?.avg_win)}`,       color: "text-emerald-400" },
              { label: "Avg Loss",       val: `$${f(perf?.avg_loss)}`,       color: "text-rose-400"    },
              { label: "Max Drawdown",   val: `$${f(perf?.max_drawdown)}`,   color: "text-rose-400"    },
              { label: "Net PnL",        val: `${sgn(perf?.total_pnl)}$${f(perf?.total_pnl)}`,
                                                                              color: (perf?.total_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div className="label mb-1">{label}</div>
                <div className={`font-bold font-mono ${color}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Current week preview */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">This Week</span>
            {cw && <span className="text-[11px] text-slate-600 ml-2">{cw.week_start}</span>}
          </div>
          {cw ? (
            <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[12px]">
              {[
                { label: "Trades",       val: String(cw.total_trades),                       color: "text-white" },
                { label: "Win Rate",     val: `${f(cw.win_rate, 1)}%`,                       color: (cw.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
                { label: "Expectancy",   val: `${sgn(cw.expectancy)}$${f(cw.expectancy)}`,  color: (cw.expectancy ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: "Profit Factor",val: f(cw.profit_factor),                           color: (cw.profit_factor ?? 0) >= 1 ? "text-emerald-400" : "text-rose-400" },
                { label: "Agent PnL",    val: `${sgn(cw.agent_pnl)}$${f(cw.agent_pnl)}`,   color: (cw.agent_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: "Alpha vs B&H", val: `${sgn(cw.alpha)}$${f(cw.alpha)}`,            color: alphaUp ? "text-emerald-400" : "text-rose-400" },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <div className="label mb-1">{label}</div>
                  <div className={`font-bold font-mono ${color}`}>{val}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-600 text-sm">No trades this week yet</div>
          )}
        </div>

      </div>

      {/* Equity curve */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Equity Curve</span>
          <span className="text-[11px] text-slate-500 ml-2">cumulative PnL over time</span>
        </div>
        <div className="p-4">
          <EquityChart curve={perf?.equity_curve ?? []} />
        </div>
      </div>

      {/* Recent signals */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Decision Log</span>
          <span className="text-[11px] text-slate-500 ml-2">
            regime + active strategy shown in <span className="font-mono bg-[#1a2235] px-1 rounded text-slate-400">[tag]</span>
          </span>
        </div>
        {recentSignals.length === 0 ? (
          <div className="py-12 text-center text-slate-600 text-sm">No signals yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a2030]">
                  {["Time (ET)", "Signal", "Price", "Context", "Reason", "Action"]
                    .map(h => <th key={h} className="th">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recentSignals.map(s => <SignalRow key={s.id} s={s} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
