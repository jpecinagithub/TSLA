import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { api } from "../lib/api";
import { useStrategy } from "../lib/StrategyContext";

interface Perf {
  total_trades: number; win_rate: number; profit_factor: number|null;
  avg_win: number; avg_loss: number; total_pnl: number; max_drawdown: number;
  equity_curve: { ts: string; cumulative_pnl: number }[];
}
interface Trade { net_pnl: number|null; }

const f = (n: number|null|undefined, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX = {
  chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme: { mode: "dark" as const },
  grid:  { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

export default function Performance() {
  const { strategy } = useStrategy();

  const { data: perf } = useQuery<Perf>({
    queryKey: ["performance", strategy],
    queryFn:  () => api.get(`/performance?strategy=${strategy}`),
    refetchInterval: 60_000,
  });
  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ["trades", strategy],
    queryFn:  () => api.get(`/trades?limit=500&strategy=${strategy}`),
  });

  const totalUp = (perf?.total_pnl ?? 0) >= 0;
  const equity  = (perf?.equity_curve ?? []).map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl }));
  const wins    = trades.filter(t => (t.net_pnl ?? 0) > 0).length;
  const losses  = trades.filter(t => (t.net_pnl ?? 0) <= 0 && t.net_pnl != null).length;

  // Histogram
  const pnlVals = trades.map(t => t.net_pnl ?? 0).filter(v => v !== 0);
  const buckets: Record<number, number> = {};
  pnlVals.forEach(v => { const b = Math.round(v / 2) * 2; buckets[b] = (buckets[b] ?? 0) + 1; });
  const hist = Object.entries(buckets).map(([k, v]) => ({ x: Number(k), y: v })).sort((a, b) => a.x - b.x);

  const kpis = [
    { label: "Win Rate",      val: perf ? `${f(perf.win_rate)}%` : "—",  color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400", sub: `${perf?.total_trades ?? 0} trades` },
    { label: "Profit Factor", val: perf?.profit_factor != null ? f(perf.profit_factor) : "—", color: (perf?.profit_factor ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400", sub: "Gross wins ÷ gross losses" },
    { label: "Max Drawdown",  val: perf ? `$${f(perf.max_drawdown)}` : "—", color: "text-rose-400", sub: "Peak-to-trough" },
    { label: "Expectancy",    val: perf && perf.total_trades > 0 ? `${totalUp?"+":""}$${f(perf.total_pnl / perf.total_trades)}` : "—", color: totalUp ? "text-emerald-400" : "text-rose-400", sub: "Avg PnL per trade" },
  ];

  return (
    <div className="p-5 flex flex-col gap-5">

      <h1 className="text-base font-bold text-white">Performance Analysis</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, val, color, sub }) => (
          <div key={label} className="surface px-5 py-4">
            <div className="label mb-2">{label}</div>
            <div className={`val-lg ${color}`}>{val}</div>
            <div className="text-[11px] text-slate-600 mt-1.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Equity curve — full width */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Equity Curve</span>
          <span className={`text-[12px] font-semibold font-mono ${totalUp ? "text-emerald-400" : "text-rose-400"}`}>
            {totalUp ? "+" : ""}${f(perf?.total_pnl)} total
          </span>
        </div>
        <div className="p-4">
          {equity.length > 0 ? (
            <ReactApexChart
              type="area" height={200}
              series={[{ name: "Cumulative PnL", data: equity }]}
              options={{
                ...APEX,
                stroke: { curve: "smooth", width: 2 },
                fill:   { type: "gradient", gradient: { opacityFrom: 0.25, opacityTo: 0 } },
                colors: [totalUp ? "#10b981" : "#f43f5e"],
                xaxis:  { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis:  { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                tooltip: { ...APEX.tooltip, x: { format: "HH:mm dd MMM" } },
              }}
            />
          ) : (
            <div className="h-[200px] grid place-items-center text-slate-600 text-sm">No closed trades yet</div>
          )}
        </div>
      </div>

      {/* Win/Loss + Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Donut */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">Win / Loss Split</span>
          </div>
          <div className="p-4">
            {wins + losses > 0 ? (
              <ReactApexChart
                type="donut" height={220}
                series={[wins, losses]}
                options={{
                  ...APEX,
                  labels:  ["Wins", "Losses"],
                  colors:  ["#10b981", "#f43f5e"],
                  legend:  { position: "bottom", labels: { colors: "#64748b" }, fontSize: "12px" },
                  plotOptions: { pie: { donut: { size: "60%", labels: {
                    show: true,
                    total: { show: true, label: "Win Rate", color: "#94a3b8", formatter: () => `${f(perf?.win_rate, 1)}%` },
                    value: { color: "#e2e8f0", fontSize: "22px", fontWeight: 700 },
                  } } } },
                  dataLabels: { enabled: false },
                  stroke: { width: 0 },
                }}
              />
            ) : (
              <div className="h-[220px] grid place-items-center text-slate-600 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* Histogram */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030]">
            <span className="text-sm font-semibold text-white">PnL Distribution</span>
          </div>
          <div className="p-4">
            {hist.length > 0 ? (
              <ReactApexChart
                type="bar" height={220}
                series={[{ name: "Trades", data: hist.map(e => ({ x: `$${e.x}`, y: e.y })) }]}
                options={{
                  ...APEX,
                  colors: hist.map(e => e.x >= 0 ? "#10b981" : "#f43f5e"),
                  plotOptions: { bar: { distributed: true, borderRadius: 3, columnWidth: "65%" } },
                  legend:  { show: false },
                  xaxis:   { labels: { style: { colors: "#475569" }, rotate: -45 } },
                  yaxis:   { labels: { style: { colors: "#475569" } } },
                  stroke:  { width: 0 },
                }}
              />
            ) : (
              <div className="h-[220px] grid place-items-center text-slate-600 text-sm">No data</div>
            )}
          </div>
        </div>

      </div>

      {/* Avg stats */}
      <div className="surface px-5 py-4 flex flex-wrap gap-8">
        {[
          { label: "Avg Win",     val: `+$${f(perf?.avg_win)}`,  color: "text-emerald-400" },
          { label: "Avg Loss",    val: `$${f(perf?.avg_loss)}`,  color: "text-rose-400"    },
          { label: "Total Wins",  val: String(wins),             color: "text-emerald-400" },
          { label: "Total Losses",val: String(losses),           color: "text-rose-400"    },
          { label: "Net PnL",     val: `${totalUp?"+":""}$${f(perf?.total_pnl)}`, color: totalUp ? "text-emerald-400" : "text-rose-400" },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div className="label mb-1">{label}</div>
            <div className={`text-base font-bold font-mono ${color}`}>{val}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
