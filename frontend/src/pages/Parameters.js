import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RotateCcw, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
const GROUPS = {
    "EMA Strategy": { keys: ["ema_fast", "ema_slow"], color: "text-blue-400" },
    "RSI": { keys: ["rsi_period", "rsi_overbought", "rsi_oversold"], color: "text-violet-400" },
    "Volume": { keys: ["vol_spike_mult"], color: "text-emerald-400" },
    "Trade Targets": { keys: ["profit_target_pct", "stop_loss_pct"], color: "text-amber-400" },
    "Risk Control": { keys: ["max_risk_pct", "max_daily_loss_pct", "max_trades_day", "slippage_pct"], color: "text-rose-400" },
};
export default function Parameters() {
    const qc = useQueryClient();
    const { data: params = [], isLoading } = useQuery({
        queryKey: ["parameters"],
        queryFn: () => api.get("/parameters"),
    });
    const mutation = useMutation({
        mutationFn: ({ key, value }) => api.put(`/parameters/${key}`, { value }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["parameters"] }),
    });
    const [draft, setDraft] = useState({});
    const map = Object.fromEntries(params.map(p => [p.key, p]));
    const dirty = Object.keys(draft).filter(k => draft[k] !== map[k]?.value);
    const val = (k) => draft[k] ?? map[k]?.value ?? "";
    const isDirty = (k) => draft[k] !== undefined && draft[k] !== map[k]?.value;
    const resetKey = (k) => setDraft(p => { const n = { ...p }; delete n[k]; return n; });
    const saveAll = () => { dirty.forEach(k => mutation.mutate({ key: k, value: draft[k] })); setDraft({}); };
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Strategy Parameters" }), _jsx("p", { className: "text-[12px] text-slate-500 mt-0.5", children: "Changes take effect on the next 1-min bar and are logged to the audit trail" })] }), dirty.length > 0 && (_jsxs("button", { onClick: saveAll, disabled: mutation.isPending, className: "btn-primary", children: [_jsx(Save, { size: 14 }), "Save ", dirty.length, " change", dirty.length > 1 ? "s" : ""] }))] }), isLoading ? (_jsx("div", { className: "text-slate-600 text-sm", children: "Loading\u2026" })) : (_jsx("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4", children: Object.entries(GROUPS).map(([group, { keys, color }]) => (_jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 px-5 py-3 border-b border-[#1a2030]", children: [_jsx(ChevronRight, { size: 13, className: color }), _jsx("span", { className: "text-[13px] font-semibold text-white", children: group })] }), _jsx("div", { className: "divide-y divide-[#1a2030]", children: keys.map(key => {
                                const p = map[key];
                                if (!p)
                                    return null;
                                const dirty = isDirty(key);
                                return (_jsxs("div", { className: "flex items-center gap-4 px-5 py-3.5", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx("span", { className: `font-mono text-[12px] font-semibold ${color}`, children: key }), dirty && _jsx("span", { className: "pill-amber text-[10px]", children: "unsaved" })] }), _jsx("div", { className: "text-[11px] text-slate-600 leading-tight", children: p.description })] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx("input", { className: "input-field w-24 text-right text-sm font-mono h-8", value: val(key), onChange: e => setDraft(prev => ({ ...prev, [key]: e.target.value })) }), dirty && (_jsx("button", { onClick: () => resetKey(key), className: "text-slate-600 hover:text-slate-300 transition-colors p-1", title: "Reset", children: _jsx(RotateCcw, { size: 12 }) }))] })] }, key));
                            }) })] }, group))) })), mutation.isError && (_jsx("div", { className: "surface border-rose-500/30 px-5 py-3 text-rose-400 text-sm", children: "Error saving \u2014 check backend logs." })), mutation.isSuccess && !mutation.isPending && (_jsx("div", { className: "surface border-emerald-500/30 px-5 py-3 text-emerald-400 text-sm", children: "Parameters saved successfully." }))] }));
}
