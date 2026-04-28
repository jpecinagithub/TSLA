import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Badge from "../components/Badge";
import { api } from "../lib/api";
import { useStrategy } from "../lib/StrategyContext";
const f = (n, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
export default function TradeHistory() {
    const { strategy } = useStrategy();
    const { data: trades = [] } = useQuery({
        queryKey: ["trades", strategy],
        queryFn: () => api.get(`/trades?limit=200&strategy=${strategy}`),
        refetchInterval: 30000,
    });
    const { data: perf } = useQuery({
        queryKey: ["performance", strategy],
        queryFn: () => api.get(`/performance?strategy=${strategy}`),
        refetchInterval: 30000,
    });
    const totalUp = (perf?.total_pnl ?? 0) >= 0;
    const equity = (perf?.equity_curve ?? []).map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl }));
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Trade History" }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: "Total Trades", val: perf?.total_trades ?? "—", color: "text-white" },
                    { label: "Win Rate", val: perf ? `${f(perf.win_rate)}%` : "—", color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
                    { label: "Profit Factor", val: perf?.profit_factor != null ? f(perf.profit_factor) : "—", color: (perf?.profit_factor ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400" },
                    { label: "Net PnL", val: perf ? `${totalUp ? "+" : ""}$${f(perf.total_pnl)}` : "—", color: totalUp ? "text-emerald-400" : "text-rose-400" },
                ].map(({ label, val, color }) => (_jsxs("div", { className: "surface px-5 py-4", children: [_jsx("div", { className: "label mb-2", children: label }), _jsx("div", { className: `val-lg ${color}`, children: val })] }, label))) }), equity.length > 0 && (_jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030] flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Equity Curve" }), _jsxs("span", { className: `text-[12px] font-semibold ${totalUp ? "text-emerald-400" : "text-rose-400"}`, children: [totalUp ? "+" : "", "$", f(perf?.total_pnl)] })] }), _jsx("div", { className: "p-4", children: _jsx(ReactApexChart, { type: "area", height: 160, series: [{ name: "PnL", data: equity }], options: {
                                ...APEX,
                                stroke: { curve: "smooth", width: 2 },
                                fill: { type: "gradient", gradient: { opacityFrom: 0.2, opacityTo: 0 } },
                                colors: [totalUp ? "#10b981" : "#f43f5e"],
                                xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                                yaxis: { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                            } }) })] })), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030] flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "All Trades" }), _jsxs("div", { className: "flex gap-5 text-[12px]", children: [_jsxs("span", { className: "text-slate-500", children: ["Avg win: ", _jsxs("span", { className: "text-emerald-400 font-mono", children: ["+$", f(perf?.avg_win)] })] }), _jsxs("span", { className: "text-slate-500", children: ["Avg loss: ", _jsxs("span", { className: "text-rose-400 font-mono", children: ["$", f(perf?.avg_loss)] })] })] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#1a2030]", children: [_jsx("th", { className: "th", children: "#" }), _jsx("th", { className: "th", children: "Entry" }), _jsx("th", { className: "th", children: "Exit" }), _jsx("th", { className: "th", children: "Entry $" }), _jsx("th", { className: "th", children: "Exit $" }), _jsx("th", { className: "th", children: "Shares" }), _jsx("th", { className: "th", children: "Net PnL" }), _jsx("th", { className: "th", children: "Exit Reason" }), _jsx("th", { className: "th", children: "Status" })] }) }), _jsxs("tbody", { children: [trades.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "td text-center py-16 text-slate-600", children: "No trades yet" }) })), trades.map(t => {
                                            const up = (t.net_pnl ?? 0) >= 0;
                                            return (_jsxs("tr", { className: "tr", children: [_jsxs("td", { className: "td text-slate-600 text-[12px]", children: ["#", t.id] }), _jsx("td", { className: "td font-mono text-[12px] whitespace-nowrap", children: new Date(t.entry_ts).toLocaleString() }), _jsx("td", { className: "td font-mono text-[12px] text-slate-500 whitespace-nowrap", children: t.exit_ts ? new Date(t.exit_ts).toLocaleString() : "—" }), _jsxs("td", { className: "td font-mono font-semibold", children: ["$", f(t.entry_price)] }), _jsx("td", { className: "td font-mono", children: t.exit_price != null ? `$${f(t.exit_price)}` : "—" }), _jsx("td", { className: "td font-mono text-[12px]", children: f(t.shares, 4) }), _jsx("td", { className: `td font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`, children: t.net_pnl != null ? `${up ? "+" : ""}$${f(t.net_pnl)}` : "—" }), _jsx("td", { className: "td text-[12px] text-slate-500", children: t.exit_reason ?? "—" }), _jsx("td", { className: "td", children: _jsx(Badge, { value: t.status }) })] }, t.id));
                                        })] })] }) })] })] }));
}
