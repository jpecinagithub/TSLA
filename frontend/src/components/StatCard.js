import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TrendingUp, TrendingDown } from "lucide-react";
export default function StatCard({ label, value, sub, trend = "neutral", icon }) {
    const color = trend === "up" ? "text-emerald-400"
        : trend === "down" ? "text-rose-400"
            : "text-white";
    return (_jsxs("div", { className: "surface px-5 py-4 flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "label", children: label }), icon && _jsx("span", { className: "text-slate-600", children: icon })] }), _jsx("div", { className: `val-lg ${color}`, children: value }), (sub || trend !== "neutral") && (_jsxs("div", { className: "flex items-center gap-1.5", children: [trend === "up" && _jsx(TrendingUp, { size: 12, className: "text-emerald-400" }), trend === "down" && _jsx(TrendingDown, { size: 12, className: "text-rose-400" }), sub && _jsx("span", { className: "text-[12px] text-slate-500", children: sub })] }))] }));
}
