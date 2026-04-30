import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { api } from "../lib/api";
import { STRATEGIES } from "../lib/StrategyContext";
// Comparison shows only the 3 individual baselines (adaptive has its own page)
const BASE_STRATEGIES = STRATEGIES.filter(s => s.value !== "adaptive");
const f = (n, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX_BASE = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
const COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6"]; // blue / amber / violet
function stratMeta(value) {
    return STRATEGIES.find(s => s.value === value) ?? STRATEGIES[0];
}
export default function Comparison() {
    const { data: portfolios = [] } = useQuery({
        queryKey: ["portfolio/all"],
        queryFn: () => api.get("/portfolio/all"),
        refetchInterval: 30000,
    });
    // Fetch performance for the 3 baseline strategies in parallel
    const perfQueries = BASE_STRATEGIES.map(s => 
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
        queryKey: ["performance", s.value],
        queryFn: () => api.get(`/performance?strategy=${s.value}`),
        refetchInterval: 60000,
    }));
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
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Strategy Comparison" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: portfolios.filter(p => p.strategy !== "adaptive").map((p) => {
                    const meta = stratMeta(p.strategy);
                    const up = p.realized_pnl >= 0;
                    const dayUp = p.daily_pnl >= 0;
                    return (_jsxs("div", { className: "surface px-5 py-4 flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `font-bold text-[12px] tracking-wide uppercase ${meta.color}`, children: meta.short }), _jsx("span", { className: "text-slate-500 text-[11px]", children: meta.label })] }), _jsxs("div", { className: "flex justify-between items-end", children: [_jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: "Capital" }), _jsxs("div", { className: "text-lg font-bold text-white font-mono", children: ["$", f(p.capital)] })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "label mb-1", children: "All-time PnL" }), _jsxs("div", { className: `text-base font-bold font-mono ${up ? "text-emerald-400" : "text-rose-400"}`, children: [up ? "+" : "", "$", f(p.realized_pnl), _jsxs("span", { className: "text-[11px] ml-1 opacity-70", children: ["(", up ? "+" : "", f(p.pnl_pct), "%)"] })] })] })] }), _jsxs("div", { className: "flex justify-between text-[12px]", children: [_jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Today: " }), _jsxs("span", { className: `font-semibold font-mono ${dayUp ? "text-emerald-400" : "text-rose-400"}`, children: [dayUp ? "+" : "", "$", f(p.daily_pnl)] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Trades: " }), _jsx("span", { className: "text-slate-300 font-semibold", children: p.total_trades })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Win%: " }), _jsxs("span", { className: `font-semibold ${p.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"}`, children: [f(p.win_rate, 1), "%"] })] })] })] }, p.strategy));
                }) }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Equity Curves \u2014 All Strategies" }) }), _jsx("div", { className: "p-4", children: hasEquity ? (_jsx(ReactApexChart, { type: "line", height: 220, series: equitySeries, options: {
                                ...APEX_BASE,
                                stroke: { curve: "smooth", width: 2 },
                                colors: COLORS,
                                xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
                                yaxis: { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                                legend: { labels: { colors: "#64748b" } },
                                tooltip: { ...APEX_BASE.tooltip, x: { format: "HH:mm dd MMM" } },
                            } })) : (_jsx("div", { className: "h-[220px] grid place-items-center text-slate-600 text-sm", children: "No closed trades yet \u2014 equity curves will appear here" })) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [_jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Net PnL per Strategy" }) }), _jsx("div", { className: "p-4", children: _jsx(ReactApexChart, { type: "bar", height: 200, series: pnlBar.series, options: {
                                        ...APEX_BASE,
                                        colors: pnlBar.series[0].data.map(v => v >= 0 ? "#10b981" : "#f43f5e"),
                                        plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "45%" } },
                                        legend: { show: false },
                                        xaxis: { categories: pnlBar.labels, labels: { style: { colors: "#64748b" } }, axisBorder: { show: false } },
                                        yaxis: { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
                                        dataLabels: {
                                            enabled: true,
                                            formatter: v => `$${Number(v).toFixed(2)}`,
                                            style: { fontSize: "11px", colors: ["#e2e8f0"] },
                                        },
                                    } }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Win Rate per Strategy" }) }), _jsx("div", { className: "p-4", children: _jsx(ReactApexChart, { type: "bar", height: 200, series: winBar.series, options: {
                                        ...APEX_BASE,
                                        colors: COLORS,
                                        plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "45%" } },
                                        legend: { show: false },
                                        xaxis: { categories: winBar.labels, labels: { style: { colors: "#64748b" } }, axisBorder: { show: false } },
                                        yaxis: { min: 0, max: 100, labels: { formatter: v => `${v}%`, style: { colors: "#475569" } } },
                                        dataLabels: {
                                            enabled: true,
                                            formatter: v => `${Number(v).toFixed(1)}%`,
                                            style: { fontSize: "11px", colors: ["#e2e8f0"] },
                                        },
                                    } }) })] })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Detailed Statistics" }) }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#1a2030]", children: [_jsx("th", { className: "th", children: "Strategy" }), _jsx("th", { className: "th", children: "Trades" }), _jsx("th", { className: "th", children: "Win Rate" }), _jsx("th", { className: "th", children: "Profit Factor" }), _jsx("th", { className: "th", children: "Avg Win" }), _jsx("th", { className: "th", children: "Avg Loss" }), _jsx("th", { className: "th", children: "Max Drawdown" }), _jsx("th", { className: "th", children: "Net PnL" })] }) }), _jsx("tbody", { children: BASE_STRATEGIES.map((s, i) => {
                                        const perf = perfQueries[i].data;
                                        const pf = perf?.profit_factor;
                                        const up = (perf?.total_pnl ?? 0) >= 0;
                                        return (_jsxs("tr", { className: "tr", children: [_jsxs("td", { className: "td", children: [_jsx("span", { className: `font-bold text-[12px] ${s.color}`, children: s.short }), _jsx("span", { className: "text-slate-500 text-[11px] ml-2", children: s.label })] }), _jsx("td", { className: "td font-mono text-[12px]", children: perf?.total_trades ?? 0 }), _jsxs("td", { className: `td font-mono text-[12px] ${(perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400"}`, children: [f(perf?.win_rate, 1), "%"] }), _jsx("td", { className: `td font-mono text-[12px] ${(pf ?? 0) >= 1.3 ? "text-emerald-400" : "text-amber-400"}`, children: f(pf, 2) }), _jsxs("td", { className: "td font-mono text-[12px] text-emerald-400", children: ["+$", f(perf?.avg_win)] }), _jsxs("td", { className: "td font-mono text-[12px] text-rose-400", children: ["$", f(perf?.avg_loss)] }), _jsxs("td", { className: "td font-mono text-[12px] text-rose-400", children: ["$", f(perf?.max_drawdown)] }), _jsxs("td", { className: `td font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`, children: [up ? "+" : "", "$", f(perf?.total_pnl)] })] }, s.value));
                                    }) })] }) })] })] }));
}
