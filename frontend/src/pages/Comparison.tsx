import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { api } from "../lib/api";
import { STRATEGIES } from "../lib/StrategyContext";

// Comparison shows only the 3 individual baselines (adaptive has its own page)
const BASE_STRATEGIES = STRATEGIES.filter(s => s.value !== "adaptive");

interface PortfolioRow {
  strategy:       string;
  capital:        number;
  initial_capital: number;
  realized_pnl:   number;
  daily_pnl:      number;
  pnl_pct:        number;
  total_trades:   number;
  win_rate:       number;
}

interface PerfRow {
  total_trades:  number;
  win_rate:      number;
  profit_factor: number | null;
  avg_win:       number;
  avg_loss:      number;
  total_pnl:     number;
  max_drawdown:  number;
  equity_curve:  { ts: string; cumulative_pnl: number }[];
}

const f = (n: number | null | undefined, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX_BASE = {
  chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme: { mode: "dark" as const },
  grid:  { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};
const COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6"];  // blue / amber / violet

function stratMeta(value: string) {
  return STRATEGIES.find(s => s.value === value) ?? STRATEGIES[0];
}

export default function Comparison() {
  const { data: portfolios = [] } = useQuery<PortfolioRow[]>({
    queryKey: ["portfolio/all"],
    queryFn:  () => api.get("/portfolio/all"),
    refetchInterval: 30_000,
  });

  // Fetch performance for the 3 baseline strategies in parallel
  const perfQueries = BASE_STRATEGIES.map(s =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<PerfRow>({
      queryKey: ["performance", s.value],
      queryFn:  () => api.get(`/performance?strategy=${s.value}`),
      refetchInterval: 60_000,
    })
  );

  // Build equity curve series for the overlay chart
  const equitySeries = BASE_STRATEGIES.map((strat, i) => {
    const perf = perfQueries[i].data;
    const data = (perf?.equity_curve ?? []).map(p => ({
      x: new Date(p.ts).getTime(),
      y: p.cumulative_pnl,
    }));
    return { name: strat.label, data };
  });

  const hasEquity = equitySeries.some(s => s.data.length > 0);

  // Bar chart: total PnL per strategy
  const pnlBar = {
    series: [{ name: "Net PnL", data: BASE_STRATEGIES.map((_s, i) => perfQueries[i].data?.total_pnl ?? 0) }],
    labels: BASE_STRATEGIES.map(s => s.short),
  };

  // Win rate bars
  const winBar = {
    series: [{ name: "Win Rate", data: BASE_STRATEGIES.map((_s, i) => perfQueries[i].data?.win_rate ?? 0) }],
    labels: BASE_STRATEGIES.map(s => s.short),
  };

  return (
    <div className="p-5 flex flex-col gap-5">

      <h1 className="text-base font-bold text-white">Strategy Comparison</h1>

      {/* ── Capital & PnL cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {portfolios.filter(p => p.strategy !== "adaptive").map((p) => {
          const meta  = stratMeta(p.strategy);
          const up    = p.realized_pnl >= 0;
          const dayUp = p.daily_pnl >= 0;
          return (
            <div key={p.strategy} className="surface px-5 py-4 flex flex-col gap-3">
              {/* Strategy label */}
              <div className="flex items-center gap-2">
                <span className={`font-bold text-[12px] tracking-wide uppercase ${meta.color}`}>
                  {meta.short}
                </span>
                <span className="text-slate-500 text-[11px]">{meta.label}</span>
              </div>
              {/* Numbers */}
              <div className="flex justify-between items-end">
                <div>
                  <div className="label mb-1">Capital</div>
                  <div className="text-lg font-bold text-white font-mono">${f(p.capital)}</div>
                </div>
                <div className="text-right">
                  <div className="label mb-1">All-time PnL</div>
                  <div className={`text-base font-bold font-mono ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {up ? "+" : ""}${f(p.realized_pnl)}
                    <span className="text-[11px] ml-1 opacity-70">({up ? "+" : ""}{f(p.pnl_pct)}%)</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-[12px]">
                <div>
                  <span className="text-slate-600">Today: </span>
                  <span className={`font-semibold font-mono ${dayUp ? "text-emerald-400" : "text-rose-400"}`}>
                    {dayUp ? "+" : ""}${f(p.daily_pnl)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Trades: </span>
                  <span className="text-slate-300 font-semibold">{p.total_trades}</span>
                </div>
                <div>
                  <span className="text-slate-600">Win%: </span>
                  <span className={`font-semibold ${p.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                    {f(p.win_rate, 1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Equity curves overlay ── */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Equity Curves — All Strategies</span>
        </div>
        <div className="p-4">
          {hasEquity ? (
            <ReactApexChart
              type="line" height={220}
              series={equitySeries}
              options={{
                ...APEX_BASE,
                stroke: { curve: "smooth", width: 2 },
                colors: COLORS,
                xaxis:  { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis:  { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                legend: { labels: { colors: "#64748b" } },
                tooltip: { ...APEX_BASE.tooltip, x: { format: "HH:mm dd MMM" } },
              }}
            />
          ) : (
            <div className="h-[220px] grid place-items-center text-slate-600 text-sm">
              No closed trades yet — equity curves will appear here
            </div>
          )}
        </div>
      </div>

      {/* ── PnL + Win Rate bar charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">Net PnL per Strategy</span>
          </div>
          <div className="p-4">
            <ReactApexChart
              type="bar" height={200}
              series={pnlBar.series}
              options={{
                ...APEX_BASE,
                colors: pnlBar.series[0].data.map(v => v >= 0 ? "#10b981" : "#f43f5e"),
                plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "45%" } },
                legend: { show: false },
                xaxis:  { categories: pnlBar.labels, labels: { style: { colors: "#64748b" } }, axisBorder: { show: false } },
                yaxis:  { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                dataLabels: {
                  enabled: true,
                  formatter: v => `$${Number(v).toFixed(2)}`,
                  style: { fontSize: "11px", colors: ["#e2e8f0"] },
                },
              }}
            />
          </div>
        </div>

        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">Win Rate per Strategy</span>
          </div>
          <div className="p-4">
            <ReactApexChart
              type="bar" height={200}
              series={winBar.series}
              options={{
                ...APEX_BASE,
                colors: COLORS,
                plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "45%" } },
                legend: { show: false },
                xaxis:  { categories: winBar.labels, labels: { style: { colors: "#64748b" } }, axisBorder: { show: false } },
                yaxis:  { min: 0, max: 100, labels: { formatter: v => `${v}%`, style: { colors: "#475569" } } },
                dataLabels: {
                  enabled: true,
                  formatter: v => `${Number(v).toFixed(1)}%`,
                  style: { fontSize: "11px", colors: ["#e2e8f0"] },
                },
              }}
            />
          </div>
        </div>

      </div>

      {/* ── Detail table ── */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Detailed Statistics</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1a2030]">
                <th className="th">Strategy</th>
                <th className="th">Trades</th>
                <th className="th">Win Rate</th>
                <th className="th">Profit Factor</th>
                <th className="th">Avg Win</th>
                <th className="th">Avg Loss</th>
                <th className="th">Max Drawdown</th>
                <th className="th">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {BASE_STRATEGIES.map((s, i) => {
                const perf = perfQueries[i].data;
                const pf   = perf?.profit_factor;
                const up   = (perf?.total_pnl ?? 0) >= 0;
                return (
                  <tr key={s.value} className="tr">
                    <td className="td">
                      <span className={`font-bold text-[12px] ${s.color}`}>{s.short}</span>
                      <span className="text-slate-500 text-[11px] ml-2">{s.label}</span>
                    </td>
                    <td className="td font-mono text-[12px]">{perf?.total_trades ?? 0}</td>
                    <td className={`td font-mono text-[12px] ${(perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                      {f(perf?.win_rate, 1)}%
                    </td>
                    <td className={`td font-mono text-[12px] ${(pf ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400"}`}>
                      {f(pf, 2)}
                    </td>
                    <td className="td font-mono text-[12px] text-emerald-400">+${f(perf?.avg_win)}</td>
                    <td className="td font-mono text-[12px] text-rose-400">${f(perf?.avg_loss)}</td>
                    <td className="td font-mono text-[12px] text-rose-400">${f(perf?.max_drawdown)}</td>
                    <td className={`td font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                      {up ? "+" : ""}${f(perf?.total_pnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
