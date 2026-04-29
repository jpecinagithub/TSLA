import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Play, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../lib/api";
// ── Constants ─────────────────────────────────────────────────────────────────
const STRATEGY_COLORS = {
    ema_crossover: "#3b82f6",
    momentum_breakout: "#f59e0b",
    vwap_momentum: "#8b5cf6",
};
const f = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const pnl = (n) => `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
const APEX = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
// ── Equity curves overlay ─────────────────────────────────────────────────────
function EquityChart({ strategies }) {
    const series = strategies.map(s => ({
        name: s.label,
        data: s.equity_curve.map(p => ({ x: new Date(p.ts).getTime(), y: p.capital })),
    }));
    return (_jsx(ReactApexChart, { type: "line", height: 220, series: series, options: {
            ...APEX,
            colors: strategies.map(s => STRATEGY_COLORS[s.name] ?? "#64748b"),
            stroke: { curve: "smooth", width: 2 },
            xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (v) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
            legend: { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
            annotations: {
                yaxis: [{ y: 5000, borderColor: "#1e2535", borderWidth: 1, strokeDashArray: 4 }],
            },
        } }));
}
// ── Monthly PnL grouped bar chart ─────────────────────────────────────────────
function MonthlyChart({ strategies }) {
    const months = [...new Set(strategies.flatMap(s => Object.keys(s.monthly_pnl)))].sort();
    const series = strategies.map(s => ({
        name: s.label,
        data: months.map(m => s.monthly_pnl[m] ?? 0),
    }));
    return (_jsx(ReactApexChart, { type: "bar", height: 200, series: series, options: {
            ...APEX,
            colors: strategies.map(s => STRATEGY_COLORS[s.name] ?? "#64748b"),
            plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } },
            xaxis: { categories: months, labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (v) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
            legend: { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
            dataLabels: { enabled: false },
            annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1 }] },
        } }));
}
// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ s }) {
    const up = s.total_pnl >= 0;
    const color = STRATEGY_COLORS[s.name] ?? "#64748b";
    const Icon = s.total_pnl > 2 ? TrendingUp : s.total_pnl < -2 ? TrendingDown : Minus;
    const pf = s.profit_factor;
    const pfColor = pf != null && pf >= 1.3 ? "text-emerald-400" : pf != null && pf >= 1.0 ? "text-amber-400" : "text-rose-400";
    return (_jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030] flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-2.5 h-2.5 rounded-full", style: { backgroundColor: color } }), _jsx("span", { className: "text-sm font-semibold text-white", children: s.label })] }), _jsxs("div", { className: `flex items-center gap-1 text-sm font-bold ${up ? "text-emerald-400" : "text-rose-400"}`, children: [_jsx(Icon, { size: 14 }), pnl(s.total_pnl)] })] }), _jsx("div", { className: "p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]", children: [
                    ["Trades", `${s.total_trades}  (${s.avg_trades_per_day}/day)`, "text-white"],
                    ["Win rate", `${f(s.win_rate, 1)}%  (${s.winning_trades}W / ${s.losing_trades}L)`,
                        s.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"],
                    ["Profit factor", f(s.profit_factor), pfColor],
                    ["Expectancy", `${s.expectancy >= 0 ? "+" : ""}$${f(s.expectancy)}/trade`,
                        s.expectancy >= 0 ? "text-emerald-400" : "text-rose-400"],
                    ["Avg win", `+$${f(s.avg_win)}`, "text-emerald-400"],
                    ["Avg loss", `$${f(s.avg_loss)}`, "text-rose-400"],
                    ["Max drawdown", `$${f(s.max_drawdown)} (${f(s.max_drawdown_pct, 1)}%)`, "text-amber-400"],
                    ["Sharpe", f(s.sharpe_ratio), s.sharpe_ratio != null && s.sharpe_ratio > 0 ? "text-emerald-400" : "text-rose-400"],
                    ["Hold time", `${s.avg_hold_minutes} min`, "text-slate-300"],
                    ["Slippage", `$${f(s.total_slippage)}`, "text-slate-500"],
                    ["Best trade", `+$${f(s.best_trade)}`, "text-emerald-400"],
                    ["Worst trade", `$${f(s.worst_trade)}`, "text-rose-400"],
                ].map(([label, val, cls]) => (_jsxs("div", { children: [_jsx("div", { className: "text-slate-600 mb-0.5", children: label }), _jsx("div", { className: `font-mono font-semibold ${cls}`, children: val })] }, label))) }), _jsxs("div", { className: "px-4 pb-4", children: [_jsx("div", { className: "text-[11px] text-slate-600 mb-1.5", children: "Exit reasons" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: Object.entries(s.exit_reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (_jsxs("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#111520] border border-[#1e2535] text-slate-400", children: [reason, ": ", count] }, reason))) })] })] }));
}
// ── Comparison table ──────────────────────────────────────────────────────────
function ComparisonTable({ strategies }) {
    const rows = [
        { label: "Total trades", fn: s => String(s.total_trades) },
        { label: "Win rate", fn: s => `${f(s.win_rate, 1)}%`, good: s => s.win_rate >= 50 },
        { label: "Profit factor", fn: s => f(s.profit_factor), good: s => (s.profit_factor ?? 0) >= 1.3 },
        { label: "Expectancy", fn: s => `${s.expectancy >= 0 ? "+" : ""}$${f(s.expectancy)}`, good: s => s.expectancy > 0 },
        { label: "Total PnL", fn: s => pnl(s.total_pnl), good: s => s.total_pnl > 0 },
        { label: "Max drawdown", fn: s => `$${f(s.max_drawdown)} (${f(s.max_drawdown_pct, 1)}%)`, good: s => s.max_drawdown_pct < 2 },
        { label: "Sharpe ratio", fn: s => f(s.sharpe_ratio), good: s => (s.sharpe_ratio ?? 0) > 0 },
        { label: "Avg hold", fn: s => `${s.avg_hold_minutes} min` },
        { label: "Total slippage", fn: s => `$${f(s.total_slippage)}` },
        { label: "Final capital", fn: s => `$${f(s.final_capital)}`, good: s => s.final_capital > s.initial_capital },
    ];
    return (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#1a2030]", children: [_jsx("th", { className: "th text-left", children: "Metric" }), strategies.map(s => (_jsx("th", { className: "th text-center", children: _jsxs("span", { className: "flex items-center justify-center gap-1.5", children: [_jsx("span", { className: "w-2 h-2 rounded-full inline-block", style: { backgroundColor: STRATEGY_COLORS[s.name] } }), s.label] }) }, s.name)))] }) }), _jsx("tbody", { children: rows.map(({ label, fn, good }) => (_jsxs("tr", { className: "tr", children: [_jsx("td", { className: "td text-slate-400 text-[12px]", children: label }), strategies.map(s => {
                                const isGood = good?.(s);
                                const cls = good == null ? "text-slate-300"
                                    : isGood ? "text-emerald-400" : "text-rose-400";
                                return (_jsx("td", { className: `td text-center font-mono text-[12px] font-semibold ${cls}`, children: fn(s) }, s.name));
                            })] }, label))) })] }) }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function Backtest() {
    const qc = useQueryClient();
    const [isRunning, setIsRunning] = useState(false);
    const { data, isLoading, error } = useQuery({
        queryKey: ["backtest-results"],
        queryFn: () => api.get("/backtest/results"),
        staleTime: 60 * 60 * 1000, // 1 hour — matches server cache TTL
    });
    const runMutation = useMutation({
        mutationFn: () => api.post("/backtest/run"),
        onMutate: () => setIsRunning(true),
        onSettled: () => setIsRunning(false),
        onSuccess: (newData) => {
            qc.setQueryData(["backtest-results"], newData);
        },
    });
    const computedAt = data?.computed_at
        ? new Date(data.computed_at).toLocaleString("en-US", { hour12: false })
        : null;
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Backtest" }), _jsx("p", { className: "text-[12px] text-slate-500 mt-0.5", children: data ? (_jsxs(_Fragment, { children: [data.data_range.total_bars.toLocaleString(), " bars \u00B7", " ", data.data_range.trading_days, " trading days \u00B7", " ", data.data_range.start, " \u2192 ", data.data_range.end, computedAt && _jsxs("span", { className: "ml-2 text-slate-600", children: ["\u00B7 computed ", computedAt] })] })) : "Historical simulation on 5-minute TSLA bars" })] }), _jsx("button", { onClick: () => runMutation.mutate(), disabled: isRunning, className: "flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500\n                     text-white text-[12px] font-semibold transition-colors\n                     disabled:opacity-50 disabled:cursor-not-allowed", children: isRunning
                            ? _jsxs(_Fragment, { children: [_jsx(RefreshCw, { size: 13, className: "animate-spin" }), " Running\u2026"] })
                            : _jsxs(_Fragment, { children: [_jsx(Play, { size: 13 }), " Run Backtest"] }) })] }), isLoading && (_jsx("div", { className: "surface py-20 text-center text-slate-500 text-sm", children: "Running backtest\u2026 this may take a few seconds" })), error && (_jsx("div", { className: "surface py-10 text-center text-rose-400 text-sm", children: "Failed to load backtest results. Is historical data available?" })), data && (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: data.strategies.map(s => _jsx(StrategyCard, { s: s }, s.name)) }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Equity Curves" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "capital over time including open positions" })] }), _jsx("div", { className: "p-4", children: _jsx(EquityChart, { strategies: data.strategies }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Monthly PnL" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "per calendar month (ET)" })] }), _jsx("div", { className: "p-4", children: _jsx(MonthlyChart, { strategies: data.strategies }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Full Comparison" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "green = good \u00B7 red = bad" })] }), _jsx(ComparisonTable, { strategies: data.strategies })] })] }))] }));
}
