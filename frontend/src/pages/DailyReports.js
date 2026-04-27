import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Info, RefreshCw, XCircle } from "lucide-react";
import { api } from "../lib/api";
// ── Helpers ───────────────────────────────────────────────────────────────────
const f = (n, d = 2) => n != null ? n.toFixed(d) : "—";
const PRIORITY_COLOR = {
    high: "text-rose-400 border-rose-500/30 bg-rose-500/5",
    medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
    low: "text-sky-400   border-sky-500/30   bg-sky-500/5",
    info: "text-slate-400 border-slate-500/20 bg-slate-500/5",
};
const SEVERITY_ICON = {
    high: _jsx(XCircle, { size: 13, className: "text-rose-400  shrink-0" }),
    medium: _jsx(AlertTriangle, { size: 13, className: "text-amber-400 shrink-0" }),
    low: _jsx(Info, { size: 13, className: "text-sky-400   shrink-0" }),
};
function PriorityBadge({ p }) {
    const map = {
        high: "bg-rose-500/15 text-rose-400", medium: "bg-amber-500/15 text-amber-400",
        low: "bg-sky-500/15  text-sky-400", info: "bg-slate-500/15 text-slate-400",
    };
    return (_jsx("span", { className: `px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${map[p] ?? map.info}`, children: p }));
}
// ── Detail panel ──────────────────────────────────────────────────────────────
function ReportDetail({ a }) {
    const [showParams, setShowParams] = useState(false);
    const { summary, pnl, performance: perf, errors, missed_opportunities: missed, recommendations: recs } = a;
    return (_jsxs("div", { className: "border-t border-[#1a2030] bg-[#080b10] p-5 flex flex-col gap-5", children: [_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [
                    { label: "Signals", val: summary.total_signals, color: "text-white" },
                    { label: "Trades", val: summary.trades_closed, color: "text-white" },
                    { label: "Win Rate", val: `${f(perf.win_rate)}%`, color: perf.win_rate >= 50 ? "text-emerald-400" : "text-rose-400" },
                    { label: "Capital", val: pnl.capital_end != null ? `$${f(pnl.capital_end)}` : "—", color: "text-white" },
                ].map(({ label, val, color }) => (_jsxs("div", { className: "surface px-4 py-3", children: [_jsx("div", { className: "label mb-1", children: label }), _jsx("div", { className: `text-sm font-bold ${color}`, children: val })] }, label))) }), Object.keys(perf.exit_reasons || {}).length > 0 && (_jsx("div", { className: "flex flex-wrap gap-3", children: Object.entries(perf.exit_reasons).map(([k, v]) => (_jsxs("div", { className: "surface px-3 py-2 flex items-center gap-2", children: [_jsx("span", { className: "text-[11px] text-slate-500 uppercase", children: k }), _jsx("span", { className: "text-sm font-bold text-white", children: v })] }, k))) })), errors.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2", children: ["Errors Detected (", errors.length, ")"] }), _jsx("div", { className: "flex flex-col gap-2", children: errors.map((e, i) => (_jsxs("div", { className: `border rounded-lg px-3 py-2.5 flex gap-2 ${PRIORITY_COLOR[e.severity] ?? PRIORITY_COLOR.info}`, children: [SEVERITY_ICON[e.severity] ?? _jsx(Info, { size: 13, className: "shrink-0" }), _jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-[11px] font-bold uppercase mr-2", children: e.type.replace(/_/g, " ") }), e.trade_id && _jsxs("span", { className: "text-[10px] text-slate-500 mr-2", children: ["Trade #", e.trade_id] }), _jsx("span", { className: "text-[12px]", children: e.detail })] })] }, i))) })] })), missed.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2", children: ["Missed Opportunities (", missed.length, ")"] }), _jsx("div", { className: "flex flex-col gap-2", children: missed.map((m, i) => (_jsxs("div", { className: "border border-slate-700/40 bg-slate-800/20 rounded-lg px-3 py-2.5 flex gap-2", children: [_jsx(Info, { size: 13, className: "text-slate-500 shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("span", { className: "text-[11px] font-bold uppercase text-slate-400 mr-2", children: m.type.replace(/_/g, " ") }), m.ts && _jsx("span", { className: "text-[10px] text-slate-600 mr-2", children: new Date(m.ts).toLocaleTimeString() }), _jsx("span", { className: "text-[12px] text-slate-300", children: m.detail })] })] }, i))) })] })), recs.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2", children: "Recommendations" }), _jsx("div", { className: "flex flex-col gap-2", children: recs.map((r, i) => (_jsxs("div", { className: `border rounded-lg px-3 py-2.5 ${PRIORITY_COLOR[r.priority]}`, children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(PriorityBadge, { p: r.priority }), r.param !== "none" && r.param !== "strategy" && (_jsxs("span", { className: "text-[11px] font-mono text-slate-400", children: [r.param, ": ", _jsx("span", { className: "text-white", children: r.current }), r.suggested !== "—" && _jsxs(_Fragment, { children: [" \u2192 ", _jsx("span", { className: "text-emerald-400", children: r.suggested })] })] }))] }), _jsx("div", { className: "text-[12px]", children: r.reason })] }, i))) })] })), _jsxs("button", { className: "flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors w-fit", onClick: () => setShowParams(v => !v), children: [showParams ? _jsx(ChevronUp, { size: 12 }) : _jsx(ChevronDown, { size: 12 }), "Parameters snapshot"] }), showParams && (_jsx("div", { className: "surface p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[11px]", children: Object.entries(a.param_snapshot || {}).map(([k, v]) => (_jsxs("div", { className: "flex justify-between gap-2", children: [_jsx("span", { className: "text-slate-500 truncate", children: k }), _jsx("span", { className: "font-mono text-white", children: v })] }, k))) }))] }));
}
// ── Report card ───────────────────────────────────────────────────────────────
function ReportCard({ r }) {
    const [open, setOpen] = useState(false);
    const up = r.daily_pnl >= 0;
    const topRec = r.recommendations?.[0];
    return (_jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("button", { className: "w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left", onClick: () => setOpen(v => !v), children: [_jsxs("div", { className: "w-24 shrink-0", children: [_jsx("div", { className: "text-sm font-bold text-white", children: r.date }), _jsx("div", { className: "text-[10px] text-slate-600 mt-0.5", children: new Date(r.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })] }), _jsxs("div", { className: "w-20 shrink-0", children: [_jsxs("div", { className: `text-sm font-bold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`, children: [up ? "+" : "", "$", f(r.daily_pnl)] }), _jsx("div", { className: "text-[10px] text-slate-600", children: "daily PnL" })] }), _jsxs("div", { className: "w-20 shrink-0", children: [_jsxs("div", { className: `text-sm font-bold ${r.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"}`, children: [f(r.win_rate), "%"] }), _jsxs("div", { className: "text-[10px] text-slate-600", children: [r.win_count, "W / ", r.loss_count, "L"] })] }), _jsxs("div", { className: "w-24 shrink-0 text-[12px] text-slate-500", children: [_jsxs("div", { children: [_jsx("span", { className: "text-emerald-400 font-mono", children: r.buy_signals }), " BUY \u00B7 ", _jsx("span", { className: "text-rose-400 font-mono", children: r.sell_signals }), " SELL"] }), _jsxs("div", { className: "text-[10px] mt-0.5", children: [r.trades_closed, " trades"] })] }), topRec && (_jsx("div", { className: "flex-1 min-w-0 hidden sm:block", children: _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(PriorityBadge, { p: topRec.priority }), _jsx("span", { className: "text-[11px] text-slate-400 truncate", children: topRec.reason })] }) })), _jsx("div", { className: "ml-auto shrink-0 text-slate-600", children: open ? _jsx(ChevronUp, { size: 16 }) : _jsx(ChevronDown, { size: 16 }) })] }), open && r.analysis && _jsx(ReportDetail, { a: r.analysis })] }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function DailyReports() {
    const qc = useQueryClient();
    const { data: reports = [], isLoading } = useQuery({
        queryKey: ["reports"],
        queryFn: () => api.get("/reports?limit=30"),
        refetchInterval: 60000,
    });
    const generate = useMutation({
        mutationFn: () => api.post("/reports/generate"),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
    });
    const totalPnl = reports.reduce((s, r) => s + r.daily_pnl, 0);
    const allWins = reports.reduce((s, r) => s + r.win_count, 0);
    const allLoss = reports.reduce((s, r) => s + r.loss_count, 0);
    const avgWR = reports.length > 0
        ? reports.reduce((s, r) => s + r.win_rate, 0) / reports.length
        : 0;
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Daily Reports" }), _jsxs("button", { onClick: () => generate.mutate(), disabled: generate.isPending, className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30\n                     text-blue-400 text-[12px] font-semibold hover:bg-blue-600/30 transition-colors\n                     disabled:opacity-50 disabled:cursor-not-allowed", children: [_jsx(RefreshCw, { size: 12, className: generate.isPending ? "animate-spin" : "" }), "Generate today's report"] })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: "Reports", val: String(reports.length), color: "text-white" },
                    { label: "Total PnL", val: `${totalPnl >= 0 ? "+" : ""}$${f(totalPnl)}`, color: totalPnl >= 0 ? "text-emerald-400" : "text-rose-400" },
                    { label: "Avg Win Rate", val: `${f(avgWR)}%`, color: avgWR >= 50 ? "text-emerald-400" : "text-rose-400" },
                    { label: "All Trades", val: `${allWins}W / ${allLoss}L`, color: "text-slate-300" },
                ].map(({ label, val, color }) => (_jsxs("div", { className: "surface px-5 py-4", children: [_jsx("div", { className: "label mb-2", children: label }), _jsx("div", { className: `val-lg ${color}`, children: val })] }, label))) }), isLoading ? (_jsx("div", { className: "surface py-16 text-center text-slate-600 text-sm", children: "Loading\u2026" })) : reports.length === 0 ? (_jsxs("div", { className: "surface py-16 text-center", children: [_jsx("div", { className: "text-slate-500 text-sm", children: "No reports yet." }), _jsx("div", { className: "text-slate-600 text-[12px] mt-1", children: "Reports generate automatically at 16:05 ET on trading days." })] })) : (_jsx("div", { className: "flex flex-col gap-2", children: reports.map(r => _jsx(ReportCard, { r: r }, r.id)) }))] }));
}
