import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Badge from "../components/Badge";
import { api } from "../lib/api";

interface Trade {
  id: number; entry_ts: string; exit_ts: string|null;
  entry_price: number; exit_price: number|null;
  shares: number; net_pnl: number|null; exit_reason: string|null; status: string;
}
interface Perf {
  total_trades: number; win_rate: number; profit_factor: number|null;
  avg_win: number; avg_loss: number; total_pnl: number;
  equity_curve: { ts: string; cumulative_pnl: number }[];
}

const f = (n: number|null, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX = {
  chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme: { mode: "dark" as const },
  grid:  { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

export default function TradeHistory() {
  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ["trades"],
    queryFn:  () => api.get("/trades?limit=200"),
    refetchInterval: 30_000,
  });
  const { data: perf } = useQuery<Perf>({
    queryKey: ["performance"],
    queryFn:  () => api.get("/performance"),
    refetchInterval: 30_000,
  });

  const totalUp = (perf?.total_pnl ?? 0) >= 0;
  const equity  = (perf?.equity_curve ?? []).map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl }));

  return (
    <div className="p-5 flex flex-col gap-5">

      <h1 className="text-base font-bold text-white">Trade History</h1>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Trades",   val: perf?.total_trades ?? "—",               color: "text-white"         },
          { label: "Win Rate",       val: perf ? `${f(perf.win_rate)}%` : "—",     color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
          { label: "Profit Factor",  val: perf?.profit_factor != null ? f(perf.profit_factor) : "—", color: (perf?.profit_factor ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400" },
          { label: "Net PnL",        val: perf ? `${totalUp?"+":""}$${f(perf.total_pnl)}` : "—", color: totalUp ? "text-emerald-400" : "text-rose-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="surface px-5 py-4">
            <div className="label mb-2">{label}</div>
            <div className={`val-lg ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      {equity.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030] flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Equity Curve</span>
            <span className={`text-[12px] font-semibold ${totalUp ? "text-emerald-400" : "text-rose-400"}`}>
              {totalUp ? "+" : ""}${f(perf?.total_pnl)}
            </span>
          </div>
          <div className="p-4">
            <ReactApexChart
              type="area" height={160}
              series={[{ name: "PnL", data: equity }]}
              options={{
                ...APEX,
                stroke: { curve: "smooth", width: 2 },
                fill:   { type: "gradient", gradient: { opacityFrom: 0.2, opacityTo: 0 } },
                colors: [totalUp ? "#10b981" : "#f43f5e"],
                xaxis:  { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis:  { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Trades table */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">All Trades</span>
          <div className="flex gap-5 text-[12px]">
            <span className="text-slate-500">Avg win: <span className="text-emerald-400 font-mono">+${f(perf?.avg_win)}</span></span>
            <span className="text-slate-500">Avg loss: <span className="text-rose-400 font-mono">${f(perf?.avg_loss)}</span></span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1a2030]">
                <th className="th">#</th>
                <th className="th">Entry</th>
                <th className="th">Exit</th>
                <th className="th">Entry $</th>
                <th className="th">Exit $</th>
                <th className="th">Shares</th>
                <th className="th">Net PnL</th>
                <th className="th">Exit Reason</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr><td colSpan={9} className="td text-center py-16 text-slate-600">No trades yet</td></tr>
              )}
              {trades.map(t => {
                const up = (t.net_pnl ?? 0) >= 0;
                return (
                  <tr key={t.id} className="tr">
                    <td className="td text-slate-600 text-[12px]">#{t.id}</td>
                    <td className="td font-mono text-[12px] whitespace-nowrap">{new Date(t.entry_ts).toLocaleString()}</td>
                    <td className="td font-mono text-[12px] text-slate-500 whitespace-nowrap">{t.exit_ts ? new Date(t.exit_ts).toLocaleString() : "—"}</td>
                    <td className="td font-mono font-semibold">${f(t.entry_price)}</td>
                    <td className="td font-mono">{t.exit_price != null ? `$${f(t.exit_price)}` : "—"}</td>
                    <td className="td font-mono text-[12px]">{f(t.shares, 4)}</td>
                    <td className={`td font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.net_pnl != null ? `${up ? "+" : ""}$${f(t.net_pnl)}` : "—"}
                    </td>
                    <td className="td text-[12px] text-slate-500">{t.exit_reason ?? "—"}</td>
                    <td className="td"><Badge value={t.status} /></td>
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
