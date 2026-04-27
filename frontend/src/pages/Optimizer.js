import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Play, CheckCircle, XCircle, Clock } from "lucide-react";
import { api } from "../lib/api";
// ── Helpers ───────────────────────────────────────────────────────────────────
const f = (n, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX_BASE = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
// Key params to track over time
const TRACKED = ["ema_fast", "ema_slow", "rsi_overbought", "vol_spike_mult",
    "profit_target_pct", "stop_loss_pct"];
// ── Param evolution chart ─────────────────────────────────────────────────────
function ParamEvolution({ history }) {
    // Build one series per tracked param, plotting numeric value over time
    const series = TRACKED.map(key => {
        const pts = history
            .filter(c => c.key_name === key)
            .map(c => ({ x: new Date(c.ts).getTime(), y: parseFloat(c.new_value) }))
            .sort((a, b) => a.x - b.x);
        return { name: key, data: pts };
    }).filter(s => s.data.length > 0);
    if (series.length === 0) {
        return (_jsx("div", { className: "h-[200px] grid place-items-center text-slate-600 text-sm", children: "No parameter changes recorded yet" }));
    }
    return (_jsx(ReactApexChart, { type: "line", height: 220, series: series, options: {
            ...APEX_BASE,
            stroke: { curve: "stepline", width: 2 },
            markers: { size: 4 },
            xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { style: { colors: "#475569" } } },
            legend: { position: "bottom", labels: { colors: "#64748b" }, fontSize: "11px" },
            tooltip: { ...APEX_BASE.tooltip, x: { format: "dd MMM HH:mm" } },
        } }));
}
// ── PnL improvement chart ─────────────────────────────────────────────────────
function ImprovementChart({ runs }) {
    const data = [...runs]
        .reverse()
        .map(r => ({
        x: new Date(r.run_ts).getTime(),
        y: r.improvement_pct ?? 0,
    }));
    if (data.length === 0) {
        return (_jsx("div", { className: "h-[160px] grid place-items-center text-slate-600 text-sm", children: "No optimization runs yet" }));
    }
    return (_jsx(ReactApexChart, { type: "bar", height: 160, series: [{ name: "Improvement %", data }], options: {
            ...APEX_BASE,
            colors: data.map(d => d.y >= 5 ? "#10b981" : d.y >= 0 ? "#f59e0b" : "#f43f5e"),
            plotOptions: { bar: { distributed: true, borderRadius: 3, columnWidth: "60%" } },
            legend: { show: false },
            xaxis: { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (v) => `${v.toFixed(1)}%`, style: { colors: "#475569" } } },
            tooltip: { ...APEX_BASE.tooltip, x: { format: "dd MMM HH:mm" } },
            annotations: { yaxis: [{ y: 5, borderColor: "#10b981", borderWidth: 1, strokeDashArray: 4, label: { text: "apply threshold", style: { color: "#10b981", fontSize: "10px" } } }] },
        } }));
}
// ── Run row ───────────────────────────────────────────────────────────────────
function RunRow({ r }) {
    const imp = r.improvement_pct ?? 0;
    const impColor = imp >= 5 ? "text-emerald-400" : imp >= 0 ? "text-amber-400" : "text-rose-400";
    return (_jsxs("tr", { className: "tr text-[12px]", children: [_jsx("td", { className: "td font-mono text-slate-500 whitespace-nowrap", children: new Date(r.run_ts).toLocaleString() }), _jsx("td", { className: "td text-center", children: r.bars_used }), _jsx("td", { className: "td text-center", children: r.combinations_tested }), _jsx("td", { className: "td font-mono", children: r.baseline_pnl != null ? `${r.baseline_pnl >= 0 ? "+" : ""}$${f(r.baseline_pnl)}` : "—" }), _jsx("td", { className: "td font-mono", children: r.best_pnl != null ? `${r.best_pnl >= 0 ? "+" : ""}$${f(r.best_pnl)}` : "—" }), _jsxs("td", { className: `td font-bold font-mono ${impColor}`, children: [imp >= 0 ? "+" : "", f(r.improvement_pct), "%"] }), _jsx("td", { className: "td", children: r.applied
                    ? _jsxs("span", { className: "flex items-center gap-1 text-emerald-400", children: [_jsx(CheckCircle, { size: 12 }), " Applied"] })
                    : _jsxs("span", { className: "flex items-center gap-1 text-slate-600", children: [_jsx(XCircle, { size: 12 }), " Not applied"] }) }), _jsx("td", { className: "td text-slate-500 max-w-[200px] truncate", title: r.apply_reason ?? "", children: r.apply_reason || "—" })] }));
}
// ── Best params panel ─────────────────────────────────────────────────────────
function BestParamsPanel({ run }) {
    return (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: TRACKED.map(k => {
            const val = run.best_params?.[k];
            return val ? (_jsxs("div", { className: "surface px-4 py-3", children: [_jsx("div", { className: "text-[10px] text-slate-600 uppercase tracking-wide mb-1", children: k.replace(/_/g, " ") }), _jsx("div", { className: "text-base font-bold font-mono text-emerald-400", children: val })] }, k)) : null;
        }) }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function Optimizer() {
    const qc = useQueryClient();
    const { data: runs = [], isLoading } = useQuery({
        queryKey: ["optimizer-history"],
        queryFn: () => api.get("/optimizer/history?limit=20"),
        refetchInterval: 30000,
    });
    const { data: paramHistory = [] } = useQuery({
        queryKey: ["param-history"],
        queryFn: () => api.get("/optimizer/param-history?limit=100"),
        refetchInterval: 60000,
    });
    const { data: status } = useQuery({
        queryKey: ["optimizer-status"],
        queryFn: () => api.get("/optimizer/status"),
        refetchInterval: 5000,
    });
    const trigger = useMutation({
        mutationFn: () => api.post("/optimizer/run"),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["optimizer-status"] }),
    });
    const lastRun = runs[0];
    const isRunning = status?.running ?? false;
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Parameter Optimizer" }), _jsx("p", { className: "text-[11px] text-slate-500 mt-0.5", children: "Runs daily at 16:10 ET \u2014 grid search over 6 parameters \u00B7 walk-forward validation" })] }), _jsx("button", { onClick: () => trigger.mutate(), disabled: isRunning || trigger.isPending, className: "flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500\n                     text-white text-[12px] font-semibold transition-colors\n                     disabled:opacity-50 disabled:cursor-not-allowed", children: isRunning
                            ? _jsxs(_Fragment, { children: [_jsx(Clock, { size: 13, className: "animate-spin" }), " Running\u2026"] })
                            : _jsxs(_Fragment, { children: [_jsx(Play, { size: 13 }), " Run Now"] }) })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: "Runs total", val: String(runs.length), color: "text-white" },
                    { label: "Applied", val: String(runs.filter(r => r.applied).length), color: "text-emerald-400" },
                    { label: "Best improvement", val: runs.length > 0 ? `+${f(Math.max(...runs.map(r => r.improvement_pct ?? 0)))}%` : "—", color: "text-emerald-400" },
                    { label: "Last run", val: lastRun ? new Date(lastRun.run_ts).toLocaleDateString() : "—", color: "text-white" },
                ].map(({ label, val, color }) => (_jsxs("div", { className: "surface px-5 py-4", children: [_jsx("div", { className: "label mb-2", children: label }), _jsx("div", { className: `val-lg ${color}`, children: val })] }, label))) }), lastRun && (_jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030] flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Best Params (last run)" }), lastRun.applied
                                ? _jsxs("span", { className: "flex items-center gap-1 text-[11px] text-emerald-400", children: [_jsx(CheckCircle, { size: 11 }), " Auto-applied"] })
                                : _jsxs("span", { className: "text-[11px] text-slate-500", children: ["Not applied (", f(lastRun.improvement_pct), "% improvement < 5% threshold)"] })] }), _jsxs("div", { className: "p-4", children: [_jsx(BestParamsPanel, { run: lastRun }), lastRun.apply_reason && (_jsx("p", { className: "text-[11px] text-slate-500 mt-3", children: lastRun.apply_reason }))] })] })), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Improvement per Run" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "(green = auto-applied)" })] }), _jsx("div", { className: "p-4", children: _jsx(ImprovementChart, { runs: runs }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Parameter Evolution" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "step-line \u2014 value at each change" })] }), _jsx("div", { className: "p-4", children: _jsx(ParamEvolution, { history: paramHistory }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "Run History" }) }), isLoading ? (_jsx("div", { className: "py-10 text-center text-slate-600 text-sm", children: "Loading\u2026" })) : runs.length === 0 ? (_jsx("div", { className: "py-10 text-center text-slate-600 text-sm", children: "No optimization runs yet" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#1a2030]", children: ["Run at", "Bars", "Combos", "Baseline PnL", "Best PnL", "Improvement", "Status", "Notes"].map(h => (_jsx("th", { className: "th", children: h }, h))) }) }), _jsx("tbody", { children: runs.map(r => _jsx(RunRow, { r: r }, r.id)) })] }) }))] })] }));
}
