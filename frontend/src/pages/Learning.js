import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Brain, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
// ── Helpers ───────────────────────────────────────────────────────────────────
const f = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const sgn = (n) => n != null && n >= 0 ? "+" : "";
const APEX = {
    chart: { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    theme: { mode: "dark" },
    grid: { borderColor: "#1a2030" },
    tooltip: { theme: "dark" },
};
// ── Verdict banner ────────────────────────────────────────────────────────────
const VERDICT_STYLES = {
    LEARNING: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: "🧠" },
    WEAK_SIGNAL: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: "🟡" },
    NO_LEARNING: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", icon: "❌" },
    TOO_EARLY: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: "⏳" },
    NO_DATA: { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", icon: "📭" },
};
function VerdictBanner({ verdict }) {
    const s = VERDICT_STYLES[verdict.verdict] ?? VERDICT_STYLES.NO_DATA;
    return (_jsx("div", { className: `rounded-xl border px-6 py-5 ${s.bg} ${s.border}`, children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("span", { className: "text-3xl", children: s.icon }), _jsxs("div", { children: [_jsx("div", { className: `text-lg font-bold ${s.text}`, children: verdict.label }), _jsx("div", { className: "text-sm text-slate-400 mt-1", children: verdict.detail }), _jsxs("div", { className: "text-[11px] text-slate-600 mt-2", children: ["Basado en ", verdict.weeks_data, " semana", verdict.weeks_data !== 1 ? "s" : "", " de datos"] })] })] }) }));
}
// ── Regime card ───────────────────────────────────────────────────────────────
const REGIME_META = {
    TRENDING_UP: { label: "Tendencia alcista", color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: TrendingUp, detail: "EMA cruce activo — estrategia EMA Crossover recomendada" },
    TRENDING_DOWN: { label: "Tendencia bajista", color: "text-rose-400", bg: "bg-rose-500/10", Icon: TrendingDown, detail: "Mercado bajista — sin operaciones long recomendadas" },
    RANGING: { label: "Mercado lateral", color: "text-amber-400", bg: "bg-amber-500/10", Icon: Minus, detail: "Sin tendencia clara — VWAP Momentum puede tener ventaja" },
    UNKNOWN: { label: "Desconocido", color: "text-slate-400", bg: "bg-slate-500/10", Icon: AlertCircle, detail: "Datos insuficientes para clasificar el mercado" },
};
function RegimeCard({ regime }) {
    const meta = REGIME_META[regime.regime] ?? REGIME_META.UNKNOWN;
    const { Icon } = meta;
    return (_jsxs("div", { className: "surface overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: _jsx("span", { className: "text-sm font-semibold text-white", children: "R\u00E9gimen actual" }) }), _jsxs("div", { className: `p-5 ${meta.bg} flex items-center gap-4`, children: [_jsx("div", { className: `w-12 h-12 rounded-xl grid place-items-center ${meta.bg} border border-[#1e2535]`, children: _jsx(Icon, { size: 22, className: meta.color }) }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: `text-base font-bold ${meta.color}`, children: meta.label }), _jsx("div", { className: "text-[12px] text-slate-500 mt-0.5", children: meta.detail })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "label", children: "ADX" }), _jsx("div", { className: "text-sm font-bold text-white", children: f(regime.adx, 1) }), _jsx("div", { className: "label mt-1", children: "Confianza" }), _jsx("div", { className: `text-[12px] font-semibold ${meta.color}`, children: regime.confidence })] })] }), _jsxs("div", { className: "px-5 py-3 grid grid-cols-3 gap-4 text-[12px] border-t border-[#1a2030]", children: [_jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: "Precio actual" }), _jsxs("div", { className: "font-mono font-bold text-white", children: ["$", f(regime.price)] })] }), _jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: "EMA 50" }), _jsx("div", { className: "font-mono text-blue-400", children: f(regime.ema50) })] }), _jsxs("div", { children: [_jsx("div", { className: "label mb-1", children: "Estrategia recomendada" }), _jsx("div", { className: "font-semibold text-amber-400", children: regime.recommended_strategy ?? "Ninguna" })] })] })] }));
}
// ── Expectancy chart ──────────────────────────────────────────────────────────
function ExpectancyChart({ snapshots }) {
    const data = snapshots
        .filter(s => s.expectancy != null)
        .map(s => ({ x: s.week_start, y: Number(s.expectancy.toFixed(2)) }));
    if (data.length === 0)
        return _jsx("div", { className: "py-12 text-center text-slate-600 text-sm", children: "Sin datos a\u00FAn \u2014 vuelve la pr\u00F3xima semana" });
    const isPositive = data.length > 0 && data[data.length - 1].y >= 0;
    return (_jsx(ReactApexChart, { type: "line", height: 180, series: [{ name: "Expectativa $/trade", data }], options: {
            ...APEX,
            colors: [isPositive ? "#10b981" : "#f43f5e"],
            stroke: { curve: "smooth", width: 2 },
            markers: { size: 5 },
            xaxis: { type: "category", labels: { style: { colors: "#475569" }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (v) => `$${v.toFixed(1)}`, style: { colors: "#475569" } } },
            annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1, strokeDashArray: 4 }] },
        } }));
}
// ── Alpha chart ───────────────────────────────────────────────────────────────
function AlphaChart({ snapshots }) {
    const weeks = snapshots.map(s => s.week_start);
    const agent = snapshots.map(s => Number((s.agent_pnl ?? 0).toFixed(2)));
    const bnh = snapshots.map(s => Number((s.bnh_pnl ?? 0).toFixed(2)));
    if (weeks.length === 0)
        return _jsx("div", { className: "py-12 text-center text-slate-600 text-sm", children: "Sin datos a\u00FAn" });
    return (_jsx(ReactApexChart, { type: "bar", height: 180, series: [{ name: "Agente", data: agent }, { name: "Buy & Hold", data: bnh }], options: {
            ...APEX,
            colors: ["#3b82f6", "#475569"],
            plotOptions: { bar: { columnWidth: "60%", borderRadius: 2 } },
            xaxis: { categories: weeks, labels: { style: { colors: "#475569" }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (v) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
            dataLabels: { enabled: false },
            legend: { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
            annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1 }] },
        } }));
}
// ── Weekly table ──────────────────────────────────────────────────────────────
function WeeklyTable({ snapshots, current }) {
    const all = current ? [...snapshots, { ...current, week_start: current.week_start + " (actual)" }] : snapshots;
    if (all.length === 0)
        return _jsx("div", { className: "py-12 text-center text-slate-600 text-sm", children: "Sin datos semanales a\u00FAn" });
    return (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#1a2030]", children: ["Semana", "Trades", "Win%", "PF", "Expectativa", "PnL Agente", "B&H", "Alpha", "Régimen"]
                            .map(h => _jsx("th", { className: "th", children: h }, h)) }) }), _jsx("tbody", { children: [...all].reverse().map(s => {
                        const alphaUp = (s.alpha ?? 0) >= 0;
                        const expUp = (s.expectancy ?? 0) >= 0;
                        return (_jsxs("tr", { className: "tr", children: [_jsx("td", { className: "td font-mono text-[12px] text-slate-400 whitespace-nowrap", children: s.week_start }), _jsx("td", { className: "td text-center", children: s.total_trades }), _jsxs("td", { className: `td text-center font-mono text-[12px] font-semibold ${(s.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-rose-400"}`, children: [f(s.win_rate, 1), "%"] }), _jsx("td", { className: `td text-center font-mono text-[12px] font-semibold ${(s.profit_factor ?? 0) >= 1 ? "text-emerald-400" : "text-rose-400"}`, children: f(s.profit_factor) }), _jsxs("td", { className: `td text-center font-mono text-[12px] font-semibold ${expUp ? "text-emerald-400" : "text-rose-400"}`, children: [sgn(s.expectancy), "$", f(s.expectancy)] }), _jsxs("td", { className: `td text-center font-mono text-[12px] ${(s.agent_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`, children: [sgn(s.agent_pnl), "$", f(s.agent_pnl)] }), _jsxs("td", { className: "td text-center font-mono text-[12px] text-slate-400", children: [sgn(s.bnh_pnl), "$", f(s.bnh_pnl)] }), _jsxs("td", { className: `td text-center font-mono text-[12px] font-bold ${alphaUp ? "text-emerald-400" : "text-rose-400"}`, children: [sgn(s.alpha), "$", f(s.alpha)] }), _jsx("td", { className: "td text-center text-[11px] text-slate-500", children: s.regime_at_week })] }, s.week_start));
                    }) })] }) }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function Learning() {
    const { data, isLoading } = useQuery({
        queryKey: ["learning-status"],
        queryFn: () => api.get("/learning/status"),
        refetchInterval: 60000,
    });
    return (_jsxs("div", { className: "p-5 flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Brain, { size: 18, className: "text-blue-400" }), _jsxs("div", { children: [_jsx("h1", { className: "text-base font-bold text-white", children: "\u00BFEst\u00E1 aprendiendo el agente?" }), _jsx("p", { className: "text-[12px] text-slate-500 mt-0.5", children: "Seguimiento semanal de expectativa, alpha vs buy & hold y r\u00E9gimen de mercado" })] })] }), isLoading && (_jsx("div", { className: "surface py-16 text-center text-slate-500 text-sm", children: "Cargando m\u00E9tricas\u2026" })), data && (_jsxs(_Fragment, { children: [_jsx(VerdictBanner, { verdict: data.verdict }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [_jsx("div", { className: "lg:col-span-2", children: _jsx(RegimeCard, { regime: data.regime }) }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: [
                                    { label: "Semanas datos", val: String(data.verdict.weeks_data), color: "text-white" },
                                    { label: "Trades totales", val: data.snapshots.reduce((a, s) => a + s.total_trades, 0).toString(), color: "text-white" },
                                    { label: "Alpha acumulado",
                                        val: `${(data.snapshots.reduce((a, s) => a + (s.alpha ?? 0), 0) >= 0) ? "+" : ""}$${data.snapshots.reduce((a, s) => a + (s.alpha ?? 0), 0).toFixed(2)}`,
                                        color: data.snapshots.reduce((a, s) => a + (s.alpha ?? 0), 0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                                    { label: "Expectativa media",
                                        val: (() => { const e = data.snapshots.filter(s => s.expectancy != null); const m = e.length ? e.reduce((a, s) => a + (s.expectancy), 0) / e.length : null; return m != null ? `${m >= 0 ? "+" : ""}$${m.toFixed(2)}` : "—"; })(),
                                        color: "text-amber-400" },
                                ].map(({ label, val, color }) => (_jsxs("div", { className: "surface px-4 py-3", children: [_jsx("div", { className: "label mb-1", children: label }), _jsx("div", { className: `text-base font-bold font-mono ${color}`, children: val })] }, label))) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Curva de aprendizaje" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "expectativa $/trade por semana \u2014 tendencia al alza = aprendizaje" })] }), _jsx("div", { className: "p-4", children: _jsx(ExpectancyChart, { snapshots: data.snapshots }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Agente vs Buy & Hold" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "\u00BFel agente a\u00F1ade valor sobre simplemente mantener TSLA?" })] }), _jsx("div", { className: "p-4", children: _jsx(AlphaChart, { snapshots: data.snapshots }) })] }), _jsxs("div", { className: "surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a2030]", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "Historial semanal" }), _jsx("span", { className: "text-[11px] text-slate-500 ml-2", children: "cada fila = una semana de trading real" })] }), _jsx(WeeklyTable, { snapshots: data.snapshots, current: data.current_week })] })] }))] }));
}
