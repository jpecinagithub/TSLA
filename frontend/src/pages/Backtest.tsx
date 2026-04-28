import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Play, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StrategyResult {
  name: string; label: string;
  total_trades: number; winning_trades: number; losing_trades: number;
  win_rate: number; profit_factor: number | null;
  avg_win: number; avg_loss: number; best_trade: number; worst_trade: number;
  total_pnl: number; expectancy: number;
  max_drawdown: number; max_drawdown_pct: number;
  sharpe_ratio: number | null; recovery_factor: number | null;
  avg_hold_minutes: number; avg_trades_per_day: number;
  total_slippage: number; max_consec_losses: number;
  initial_capital: number; final_capital: number;
  exit_reasons: Record<string, number>;
  monthly_pnl: Record<string, number>;
  equity_curve: { ts: string; capital: number }[];
}
interface BacktestData {
  computed_at: string;
  data_range: { start: string; end: string; total_bars: number; trading_days: number };
  strategies: StrategyResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STRATEGY_COLORS: Record<string, string> = {
  ema_crossover:     "#3b82f6",
  momentum_breakout: "#f59e0b",
  vwap_momentum:     "#8b5cf6",
};
const f  = (n: number | null | undefined, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const pnl = (n: number) => `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
const APEX = {
  chart:   { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme:   { mode: "dark" as const },
  grid:    { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

// ── Equity curves overlay ─────────────────────────────────────────────────────
function EquityChart({ strategies }: { strategies: StrategyResult[] }) {
  const series = strategies.map(s => ({
    name: s.label,
    data: s.equity_curve.map(p => ({ x: new Date(p.ts).getTime(), y: p.capital })),
  }));
  return (
    <ReactApexChart
      type="line" height={220}
      series={series}
      options={{
        ...APEX,
        colors: strategies.map(s => STRATEGY_COLORS[s.name] ?? "#64748b"),
        stroke: { curve: "smooth", width: 2 },
        xaxis:  { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:  { labels: { formatter: (v: number) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
        legend: { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
        annotations: {
          yaxis: [{ y: 5000, borderColor: "#1e2535", borderWidth: 1, strokeDashArray: 4 }],
        },
      }}
    />
  );
}

// ── Monthly PnL grouped bar chart ─────────────────────────────────────────────
function MonthlyChart({ strategies }: { strategies: StrategyResult[] }) {
  const months = [...new Set(strategies.flatMap(s => Object.keys(s.monthly_pnl)))].sort();
  const series = strategies.map(s => ({
    name: s.label,
    data: months.map(m => s.monthly_pnl[m] ?? 0),
  }));
  return (
    <ReactApexChart
      type="bar" height={200}
      series={series}
      options={{
        ...APEX,
        colors:      strategies.map(s => STRATEGY_COLORS[s.name] ?? "#64748b"),
        plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } },
        xaxis:       { categories: months, labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:       { labels: { formatter: (v: number) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
        legend:      { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
        dataLabels:  { enabled: false },
        annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1 }] },
      }}
    />
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ s }: { s: StrategyResult }) {
  const up      = s.total_pnl >= 0;
  const color   = STRATEGY_COLORS[s.name] ?? "#64748b";
  const Icon    = s.total_pnl > 2 ? TrendingUp : s.total_pnl < -2 ? TrendingDown : Minus;
  const pf      = s.profit_factor;
  const pfColor = pf != null && pf >= 1.3 ? "text-emerald-400" : pf != null && pf >= 1.0 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="surface overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3 border-b border-[#1a2030] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-white">{s.label}</span>
        </div>
        <div className={`flex items-center gap-1 text-sm font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
          <Icon size={14} />
          {pnl(s.total_pnl)}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
        {[
          ["Trades",      `${s.total_trades}  (${s.avg_trades_per_day}/day)`, "text-white"],
          ["Win rate",    `${f(s.win_rate, 1)}%  (${s.winning_trades}W / ${s.losing_trades}L)`,
                          s.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"],
          ["Profit factor", f(s.profit_factor), pfColor],
          ["Expectancy",  `${s.expectancy >= 0 ? "+" : ""}$${f(s.expectancy)}/trade`,
                          s.expectancy >= 0 ? "text-emerald-400" : "text-rose-400"],
          ["Avg win",     `+$${f(s.avg_win)}`, "text-emerald-400"],
          ["Avg loss",    `$${f(s.avg_loss)}`, "text-rose-400"],
          ["Max drawdown",`$${f(s.max_drawdown)} (${f(s.max_drawdown_pct, 1)}%)`, "text-amber-400"],
          ["Sharpe",      f(s.sharpe_ratio), s.sharpe_ratio != null && s.sharpe_ratio > 0 ? "text-emerald-400" : "text-rose-400"],
          ["Hold time",   `${s.avg_hold_minutes} min`, "text-slate-300"],
          ["Slippage",    `$${f(s.total_slippage)}`, "text-slate-500"],
          ["Best trade",  `+$${f(s.best_trade)}`, "text-emerald-400"],
          ["Worst trade", `$${f(s.worst_trade)}`, "text-rose-400"],
        ].map(([label, val, cls]) => (
          <div key={label as string}>
            <div className="text-slate-600 mb-0.5">{label}</div>
            <div className={`font-mono font-semibold ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Exit reasons */}
      <div className="px-4 pb-4">
        <div className="text-[11px] text-slate-600 mb-1.5">Exit reasons</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(s.exit_reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
            <span key={reason}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#111520] border border-[#1e2535] text-slate-400">
              {reason}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────
function ComparisonTable({ strategies }: { strategies: StrategyResult[] }) {
  const rows: { label: string; fn: (s: StrategyResult) => string; good?: (s: StrategyResult) => boolean }[] = [
    { label: "Total trades",    fn: s => String(s.total_trades) },
    { label: "Win rate",        fn: s => `${f(s.win_rate, 1)}%`,          good: s => s.win_rate >= 50 },
    { label: "Profit factor",   fn: s => f(s.profit_factor),              good: s => (s.profit_factor ?? 0) >= 1.3 },
    { label: "Expectancy",      fn: s => `${s.expectancy >= 0 ? "+" : ""}$${f(s.expectancy)}`, good: s => s.expectancy > 0 },
    { label: "Total PnL",       fn: s => pnl(s.total_pnl),                good: s => s.total_pnl > 0 },
    { label: "Max drawdown",    fn: s => `$${f(s.max_drawdown)} (${f(s.max_drawdown_pct, 1)}%)`, good: s => s.max_drawdown_pct < 2 },
    { label: "Sharpe ratio",    fn: s => f(s.sharpe_ratio),               good: s => (s.sharpe_ratio ?? 0) > 0 },
    { label: "Avg hold",        fn: s => `${s.avg_hold_minutes} min` },
    { label: "Total slippage",  fn: s => `$${f(s.total_slippage)}` },
    { label: "Final capital",   fn: s => `$${f(s.final_capital)}`,        good: s => s.final_capital > s.initial_capital },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1a2030]">
            <th className="th text-left">Metric</th>
            {strategies.map(s => (
              <th key={s.name} className="th text-center">
                <span className="flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: STRATEGY_COLORS[s.name] }} />
                  {s.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, fn, good }) => (
            <tr key={label} className="tr">
              <td className="td text-slate-400 text-[12px]">{label}</td>
              {strategies.map(s => {
                const isGood = good?.(s);
                const cls = good == null ? "text-slate-300"
                  : isGood ? "text-emerald-400" : "text-rose-400";
                return (
                  <td key={s.name} className={`td text-center font-mono text-[12px] font-semibold ${cls}`}>
                    {fn(s)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Backtest() {
  const qc = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const { data, isLoading, error } = useQuery<BacktestData>({
    queryKey: ["backtest-results"],
    queryFn:  () => api.get("/backtest/results"),
    staleTime: 60 * 60 * 1000,   // 1 hour — matches server cache TTL
  });

  const runMutation = useMutation({
    mutationFn: () => api.post<BacktestData>("/backtest/run"),
    onMutate:   () => setIsRunning(true),
    onSettled:  () => setIsRunning(false),
    onSuccess:  (newData) => {
      qc.setQueryData(["backtest-results"], newData);
    },
  });

  const computedAt = data?.computed_at
    ? new Date(data.computed_at).toLocaleString("en-US", { hour12: false })
    : null;

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Backtest</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {data ? (
              <>
                {data.data_range.total_bars.toLocaleString()} bars ·{" "}
                {data.data_range.trading_days} trading days ·{" "}
                {data.data_range.start} → {data.data_range.end}
                {computedAt && <span className="ml-2 text-slate-600">· computed {computedAt}</span>}
              </>
            ) : "Historical simulation on 5-minute TSLA bars"}
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                     text-white text-[12px] font-semibold transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning
            ? <><RefreshCw size={13} className="animate-spin" /> Running…</>
            : <><Play size={13} /> Run Backtest</>}
        </button>
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="surface py-20 text-center text-slate-500 text-sm">
          Running backtest… this may take a few seconds
        </div>
      )}
      {error && (
        <div className="surface py-10 text-center text-rose-400 text-sm">
          Failed to load backtest results. Is historical data available?
        </div>
      )}

      {data && (
        <>
          {/* Strategy cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.strategies.map(s => <StrategyCard key={s.name} s={s} />)}
          </div>

          {/* Equity curves */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Equity Curves</span>
              <span className="text-[11px] text-slate-500 ml-2">capital over time including open positions</span>
            </div>
            <div className="p-4">
              <EquityChart strategies={data.strategies} />
            </div>
          </div>

          {/* Monthly PnL */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Monthly PnL</span>
              <span className="text-[11px] text-slate-500 ml-2">per calendar month (ET)</span>
            </div>
            <div className="p-4">
              <MonthlyChart strategies={data.strategies} />
            </div>
          </div>

          {/* Comparison table */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Full Comparison</span>
              <span className="text-[11px] text-slate-500 ml-2">green = good · red = bad</span>
            </div>
            <ComparisonTable strategies={data.strategies} />
          </div>
        </>
      )}
    </div>
  );
}
