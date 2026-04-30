import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Brain, TrendingUp, TrendingDown, Minus, AlertCircle, Zap, Activity, BarChart2, } from "lucide-react";
import { api } from "../lib/api";
// ── Helpers ───────────────────────────────────────────────────────────────────
const f = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const sgn = (n) => (n != null && n >= 0) ? "+" : "";
const APEX = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
// ── Regime metadata ───────────────────────────────────────────────────────────
const REGIME_META = {
    TRENDING_UP: {
        label: "Trending Up", color: "text-emerald-400", bg: "bg-emerald-500/10",
        border: "border-emerald-500/30", Icon: TrendingUp,
        strategy: "EMA Crossover", stratColor: "text-blue-400",
    },
    TRENDING_DOWN: {
        label: "Trending Down", color: "text-rose-400", bg: "bg-rose-500/10",
        border: "border-rose-500/30", Icon: TrendingDown,
        strategy: "Sitting out", stratColor: "text-slate-500",
    },
    RANGING: {
        label: "Ranging", color: "text-amber-400", bg: "bg-amber-500/10",
        border: "border-amber-500/30", Icon: Minus,
        strategy: "VWAP Momentum", stratColor: "text-violet-400",
    },
    UNKNOWN: {
        label: "Unknown", color: "text-slate-400", bg: "bg-slate-500/10",
        border: "border-slate-500/30", Icon: AlertCircle,
        strategy: "Sitting out", stratColor: "text-slate-500",
    },
};
// ── Regime Banner ─────────────────────────────────────────────────────────────
function RegimeBanner({ regime }) {
    const meta = REGIME_META[regime.regime] ?? REGIME_META.UNKNOWN;
    const { Icon } = meta;
    return (_jsx("div", { className: `rounded-xl border px-6 py-5 ${meta.bg} ${meta.border}`, children: _jsxs("div", { className: "flex items-center justify-between flex-wrap gap-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: `w-14 h-14 rounded-xl grid place-items-center ${meta.bg} border ${meta.border}`, children: _jsx(Icon, { size: 26, className: meta.color }) }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-slate-500 uppercase tracking-wider mb-0.5", children: "Market Regime" }), _jsx("div", { className: `text-2xl font-bold ${meta.color}`, children: meta.label }), _jsxs("div", { className: "text-[12px] text-slate-500 mt-0.5", children: ["Confidence: ", _jsx("span", { className: `font-semibold ${meta.color}`, children: regime.confidence }), " ", "\u00B7 ADX ", _jsx("span", { className: "font-mono text-white", children: f(regime.adx, 1) }), " ", "\u00B7 EMA50 ", _jsx("span", { className: "font-mono text-blue-400", children: f(regime.ema50) })] })] })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-[11px] text-slate-500 uppercase tracking-wider mb-0.5", children: "Active Strategy" }), _jsx("div", { className: `text-xl font-bold ${meta.stratColor}`, children: meta.strategy }), _jsxs("div", { className: "text-[11px] text-slate-600 mt-0.5", children: ["Price ", _jsxs("span", { className: "font-mono text-white", children: ["$", f(regime.price)] })] })] })] }) }));
}
// ── Equity Curve ──────────────────────────────────────────────────────────────
function EquityChart({ curve }) {
    if (curve.length === 0)
        return _jsx("div", { className: "py-10 text-center text-slate-600 text-sm", children: "No trades yet" });
    const last = curve[curve.length - 1].cumulative_pnl;
    const color = last >= 0 ? "#10b981" : "#f43f5e";
    return (_jsx(ReactApexChart, { type: "area", height: 180, series: [{ name: "Cumulative PnL", data: curve.map(p => ({ x: new Date(p.ts).getTime(), y: p.cumulative_pnl })) }], options: {
            ...APEX,
            colors: [color],
            fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02 } },
            stroke: { curve: "smooth", width: 2 },
            xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: v => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
            annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1, strokeDashArray: 4 }] },
            dataLabels: { enabled: false },
        } }));
}
// ── Signal row ────────────────────────────────────────────────────────────────
function SignalRow({ s }) {
    const isBuy = s.signal_type === "BUY";
    const isSell = s.signal_type === "SELL";
    const executed = s.action_taken === "EXECUTED";
    // Extract regime/sub-strategy from reason: "[RANGING→vwap_momentum] ..."
    const match = s.reason.match(/^\[([^\]]+)\]/);
    const tag = match ? match[1] : null;
    const detail = match ? s.reason.slice(match[0].length).trim() : s.reason;
    const tsET = new Date(s.ts + "Z").toLocaleTimeString("en-US", {
        timeZone: "America/New_York", hour: "2-digit", minute: "2-digit",
    });
    return (_jsxs("tr", { className: "tr", children: [_jsxs("td", { className: "td font-mono text-[11px] text-slate-500 whitespace-nowrap", children: [tsET, " ET"] }), _jsx("td", { className: "td", children: _jsx("span", { className: `text-[11px] font-bold px-1.5 py-0.5 rounded
          ${isBuy ? "bg-emerald-500/15 text-emerald-400" :
                        isSell ? "bg-rose-500/15 text-rose-400" : "text-slate-600"}`, children: s.signal_type }) }), _jsxs("td", { className: "td font-mono text-[12px] text-white", children: ["$", f(s.price)] }), _jsx("td", { className: "td", children: tag && (_jsx("span", { className: "text-[10px] font-mono bg-[#1a2235] text-slate-400 border border-[#1e2535]\n                           px-1.5 py-0.5 rounded whitespace-nowrap", children: tag })) }), _jsx("td", { className: "td text-[11px] text-slate-500 max-w-[200px] truncate", children: detail }), _jsx("td", { className: "td", children: _jsx("span", { className: `text-[10px] font-semibold
          ${executed ? "text-emerald-400" : "text-slate-600"}`, children: s.action_taken }) })] }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdaptiveAgent() {
    const { data: status } = useQuery({
        queryKey: ["learning-status-adaptive"],
        queryFn: () => api.get("/learning/status?strategy=adaptive"),
        refetchInterval: 30000,
    });
    const { data: port } = useQuery({
        queryKey: ["portfolio", "adaptive"],
        queryFn: () => api.get("/portfolio?strategy=adaptive"),
        refetchInterval: 15000,
    });
    const { data: perf } = useQuery({
        queryKey: ["performance", "adaptive"],
        queryFn: () => api.get("/performance?strategy=adaptive"),
        refetchInterval: 60000,
    });
    const { data: signals = [] } = useQuery({
        queryKey: ["signals", "adaptive"],
        queryFn: () => api.get("/signals?strategy=adaptive&limit=40"),
        refetchInterval: 30000,
    });
    const cw = status?.current_week;
    const pnlUp = (port?.realized_pnl ?? 0) >= 0;
    const dayUp = (port?.daily_pnl ?? 0) >= 0;
    const alphaUp = (cw?.alpha ?? 0) >= 0;
    // Recent signals: only BUY/SELL + executed first, then last 20
    const recentSignals = signals
        .slice()
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 25);
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Brain, { size: 18, className: "text-emerald-400" }), _jsxs("div", { children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Adaptive Agent" }), _jsx("p", { className: "text-[12px] text-slate-500 mt-0.5", children: "Selects the optimal strategy each minute based on market regime (ADX + EMA50)" })] })] }), status && _jsx(RegimeBanner, { regime: status.regime }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: "Capital", val: `$${f(port?.capital)}`, color: "text-white", Icon: Activity },
                    { label: "Total PnL", val: `${sgn(port?.realized_pnl)}$${f(port?.realized_pnl)}`, color: pnlUp ? "text-emerald-400" : "text-rose-400", Icon: BarChart2 },
                    { label: "Today's PnL", val: `${sgn(port?.daily_pnl)}$${f(port?.daily_pnl)}`, color: dayUp ? "text-emerald-400" : "text-rose-400", Icon: TrendingUp },
                    { label: "Total Trades", val: String(port?.total_trades ?? "—"), color: "text-white", Icon: Zap },
                ].map(({ label, val, color, Icon }) => (_jsxs("div", { className: "surface px-4 py-4 flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-lg bg-[#1a2235] grid place-items-center shrink-0", children: _jsx(Icon, { size: 16, className: "text-slate-400" }) }), _jsxs("div", { children: [_jsx("div", { className: "label mb-0.5", children: label }), _jsx("div", { className: `text-base font-bold font-mono ${color}`, children: val })] })] }, label))) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [_jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "All-time Performance" }) }), _jsx("div", { className: "p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[12px]", children: [
                                    { label: "Win Rate", val: `${f(perf?.win_rate, 1)}%`, color: (perf?.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Profit Factor", val: f(perf?.profit_factor), color: (perf?.profit_factor ?? 0) >= 1 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Avg Win", val: `+$${f(perf?.avg_win)}`, color: "text-emerald-400" },
                                    { label: "Avg Loss", val: `$${f(perf?.avg_loss)}`, color: "text-rose-400" },
                                    { label: "Max Drawdown", val: `$${f(perf?.max_drawdown)}`, color: "text-rose-400" },
                                    { label: "Net PnL", val: `${sgn(perf?.total_pnl)}$${f(perf?.total_pnl)}`,
                                        color: (perf?.total_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                                ].map(({ label, val, color }) => (_jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: label }), _jsx("div", { className: `font-bold font-mono ${color}`, children: val })] }, label))) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "This Week" }), cw && _jsx("span", { className: "text-[11px] text-slate-600 ml-2", children: cw.week_start })] }), cw ? (_jsx("div", { className: "p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[12px]", children: [
                                    { label: "Trades", val: String(cw.total_trades), color: "text-white" },
                                    { label: "Win Rate", val: `${f(cw.win_rate, 1)}%`, color: (cw.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Expectancy", val: `${sgn(cw.expectancy)}$${f(cw.expectancy)}`, color: (cw.expectancy ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Profit Factor", val: f(cw.profit_factor), color: (cw.profit_factor ?? 0) >= 1 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Agent PnL", val: `${sgn(cw.agent_pnl)}$${f(cw.agent_pnl)}`, color: (cw.agent_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Alpha vs B&H", val: `${sgn(cw.alpha)}$${f(cw.alpha)}`, color: alphaUp ? "text-emerald-400" : "text-rose-400" },
                                ].map(({ label, val, color }) => (_jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: label }), _jsx("div", { className: `font-bold font-mono ${color}`, children: val })] }, label))) })) : (_jsx("div", { className: "py-12 text-center text-slate-600 text-sm", children: "No trades this week yet" }))] })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Equity Curve" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "cumulative PnL over time" })] }), _jsx("div", { className: "p-4", children: _jsx(EquityChart, { curve: perf?.equity_curve ?? [] }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Decision Log" }), _jsxs("span", { className: "text-[11px] text-slate-500 ml-2", children: ["regime + active strategy shown in ", _jsx("span", { className: "font-mono bg-[#1a2235] px-1 rounded text-slate-400", children: "[tag]" })] })] }), recentSignals.length === 0 ? (_jsx("div", { className: "py-12 text-center text-slate-600 text-sm", children: "No signals yet" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#1a2030]", children: ["Time (ET)", "Signal", "Price", "Context", "Reason", "Action"]
                                            .map(h => _jsx("th", { className: "th", children: h }, h)) }) }), _jsx("tbody", { children: recentSignals.map(s => _jsx(SignalRow, { s: s }, s.id)) })] }) }))] })] }));
}
