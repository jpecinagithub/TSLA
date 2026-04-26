import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { api } from "../lib/api";
const f = (n, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
export default function Performance() {
    const { data: perf } = useQuery({
        queryKey: ["performance"],
        queryFn: () => api.get("/performance"),
        refetchInterval: 60000,
    });
    const { data: trades = [] } = useQuery({
        queryKey: ["trades"],
        queryFn: () => api.get("/trades?limit=500"),
    });
    const totalUp = (perf?.total_pnl ?? 0) >= 0;
    const equity = (perf?.equity_curve ?? []).map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl }));
    const wins = trades.filter(t => (t.net_pnl ?? 0) > 0).length;
    const losses = trades.filter(t => (t.net_pnl ?? 0) <= 0 && t.net_pnl != null).length;
    // Histogram
    const pnlVals = trades.map(t => t.net_pnl ?? 0).filter(v => v !== 0);
    const buckets = {};
    pnlVals.forEach(v => { const b = Math.round(v / 2) * 2; buckets[b] = (buckets[b] ?? 0) + 1; });
    const hist = Object.entries(buckets).map(([k, v]) => ({ x: Number(k), y: v })).sort((a, b) => a.x - b.x);
    const kpis = [
        { label: "Win Rate", val: perf ? `${f(perf.win_rate)}%` : "—", color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400", sub: `${perf?.total_trades ?? 0} trades` },
        { label: "Profit Factor", val: perf?.profit_factor != null ? f(perf.profit_factor) : "—", color: (perf?.profit_factor ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400", sub: "Gross wins ÷ gross losses" },
        { label: "Max Drawdown", val: perf ? `$${f(perf.max_drawdown)}` : "—", color: "text-rose-400", sub: "Peak-to-trough" },
        { label: "Expectancy", val: perf && perf.total_trades > 0 ? `${totalUp ? "+" : ""}$${f(perf.total_pnl / perf.total_trades)}` : "—", color: totalUp ? "text-emerald-400" : "text-rose-400", sub: "Avg PnL per trade" },
    ];
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Performance Analysis" }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: kpis.map(({ label, val, color, sub }) => (_jsxs("div", { className: "surface px-5 py-4", children: [_jsx("div", { className: "label mb-2", children: label }), _jsx("div", { className: `val-lg ${color}`, children: val }), _jsx("div", { className: "text-[11px] text-slate-600 mt-1.5", children: sub })] }, label))) }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030] flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Equity Curve" }), _jsxs("span", { className: `text-[12px] font-semibold font-mono ${totalUp ? "text-emerald-400" : "text-rose-400"}`, children: [totalUp ? "+" : "", "$", f(perf?.total_pnl), " total"] })] }), _jsx("div", { className: "p-4", children: equity.length > 0 ? (_jsx(ReactApexChart, { type: "area", height: 200, series: [{ name: "Cumulative PnL", data: equity }], options: {
                                ...APEX,
                                stroke: { curve: "smooth", width: 2 },
                                fill: { type: "gradient", gradient: { opacityFrom: 0.25, opacityTo: 0 } },
                                colors: [totalUp ? "#10b981" : "#f43f5e"],
                                xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                                yaxis: { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                                tooltip: { ...APEX.tooltip, x: { format: "HH:mm dd MMM" } },
                            } })) : (_jsx("div", { className: "h-[200px] grid place-items-center text-slate-600 text-sm", children: "No closed trades yet" })) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [_jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Win / Loss Split" }) }), _jsx("div", { className: "p-4", children: wins + losses > 0 ? (_jsx(ReactApexChart, { type: "donut", height: 220, series: [wins, losses], options: {
                                        ...APEX,
                                        labels: ["Wins", "Losses"],
                                        colors: ["#10b981", "#f43f5e"],
                                        legend: { position: "bottom", labels: { colors: "#64748b" }, fontSize: "12px" },
                                        plotOptions: { pie: { donut: { size: "60%", labels: {
                                                        show: true,
                                                        total: { show: true, label: "Win Rate", color: "#94a3b8", formatter: () => `${f(perf?.win_rate, 1)}%` },
                                                        value: { color: "#e2e8f0", fontSize: "22px", fontWeight: 700 },
                                                    } } } },
                                        dataLabels: { enabled: false },
                                        stroke: { width: 0 },
                                    } })) : (_jsx("div", { className: "h-[220px] grid place-items-center text-slate-600 text-sm", children: "No data" })) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "PnL Distribution" }) }), _jsx("div", { className: "p-4", children: hist.length > 0 ? (_jsx(ReactApexChart, { type: "bar", height: 220, series: [{ name: "Trades", data: hist.map(e => ({ x: `$${e.x}`, y: e.y })) }], options: {
                                        ...APEX,
                                        colors: hist.map(e => e.x >= 0 ? "#10b981" : "#f43f5e"),
                                        plotOptions: { bar: { distributed: true, borderRadius: 3, columnWidth: "65%" } },
                                        legend: { show: false },
                                        xaxis: { labels: { style: { colors: "#475569" }, rotate: -45 } },
                                        yaxis: { labels: { style: { colors: "#475569" } } },
                                        stroke: { width: 0 },
                                    } })) : (_jsx("div", { className: "h-[220px] grid place-items-center text-slate-600 text-sm", children: "No data" })) })] })] }), _jsx("div", { className: "surface px-5 py-4 flex flex-wrap gap-8", children: [
                    { label: "Avg Win", val: `+$${f(perf?.avg_win)}`, color: "text-emerald-400" },
                    { label: "Avg Loss", val: `$${f(perf?.avg_loss)}`, color: "text-rose-400" },
                    { label: "Total Wins", val: String(wins), color: "text-emerald-400" },
                    { label: "Total Losses", val: String(losses), color: "text-rose-400" },
                    { label: "Net PnL", val: `${totalUp ? "+" : ""}$${f(perf?.total_pnl)}`, color: totalUp ? "text-emerald-400" : "text-rose-400" },
                ].map(({ label, val, color }) => (_jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: label }), _jsx("div", { className: `text-base font-bold font-mono ${color}`, children: val })] }, label))) })] }));
}
