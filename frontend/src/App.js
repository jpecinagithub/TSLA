import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { Activity, BarChart2, BookOpen, ClipboardList, Settings, Sliders, TrendingUp, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useLive } from "./lib/useLive";
import LiveMonitor from "./pages/LiveMonitor";
import DecisionLog from "./pages/DecisionLog";
import TradeHistory from "./pages/TradeHistory";
import Parameters from "./pages/Parameters";
import Performance from "./pages/Performance";
import DailyReports from "./pages/DailyReports";
import Optimizer from "./pages/Optimizer";
const NAV = [
    { to: "/", label: "Live", Icon: Activity },
    { to: "/decisions", label: "Decisions", Icon: ClipboardList },
    { to: "/trades", label: "Trades", Icon: BarChart2 },
    { to: "/parameters", label: "Parameters", Icon: Settings },
    { to: "/performance", label: "Performance", Icon: TrendingUp },
    { to: "/reports", label: "Reports", Icon: BookOpen },
    { to: "/optimizer", label: "Optimizer", Icon: Sliders },
];
function f(n, d = 2) { return n != null ? n.toFixed(d) : "—"; }
export default function App() {
    const { connected } = useLive();
    const { data: port } = useQuery({
        queryKey: ["portfolio"],
        queryFn: () => api.get("/portfolio"),
        refetchInterval: 15000,
    });
    const dailyUp = (port?.daily_pnl ?? 0) >= 0;
    return (_jsx(BrowserRouter, { children: _jsxs("div", { className: "flex flex-col h-screen overflow-hidden bg-[#0a0d14]", children: [_jsxs("header", { className: "h-14 shrink-0 flex items-center justify-between px-5\n                           bg-[#0d1117] border-b border-[#1a2030]", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: "w-7 h-7 rounded-lg bg-blue-600 grid place-items-center", children: _jsx(Zap, { size: 14, className: "text-white", fill: "white" }) }), _jsx("span", { className: "text-sm font-bold text-white tracking-tight", children: "TSLA Agent" }), _jsx("span", { className: "ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold\n                             bg-amber-500/10 text-amber-400 border border-amber-500/20", children: "PAPER" })] }), _jsx("nav", { className: "flex items-center gap-1", children: NAV.map(({ to, label, Icon }) => (_jsx(NavLink, { to: to, end: to === "/", children: ({ isActive }) => (_jsxs("div", { className: isActive ? "nav-item-active" : "nav-item-inactive", children: [_jsx(Icon, { size: 14 }), label] })) }, to))) }), _jsxs("div", { className: "flex items-center gap-5", children: [_jsxs("div", { className: "text-right", children: [_jsx("div", { className: "label", children: "Capital" }), _jsxs("div", { className: "text-sm font-bold text-white tabular-nums", children: ["$", f(port?.capital)] })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "label", children: "Today" }), _jsxs("div", { className: `text-sm font-bold tabular-nums ${dailyUp ? "text-emerald-400" : "text-rose-400"}`, children: [dailyUp ? "+" : "", "$", f(port?.daily_pnl)] })] }), _jsxs("div", { className: "flex items-center gap-1.5 text-[11px] font-medium", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}` }), _jsx("span", { className: connected ? "text-emerald-400" : "text-rose-400", children: connected ? "Live" : "Off" })] })] })] }), _jsx("main", { className: "flex-1 overflow-auto", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LiveMonitor, {}) }), _jsx(Route, { path: "/decisions", element: _jsx(DecisionLog, {}) }), _jsx(Route, { path: "/trades", element: _jsx(TradeHistory, {}) }), _jsx(Route, { path: "/parameters", element: _jsx(Parameters, {}) }), _jsx(Route, { path: "/performance", element: _jsx(Performance, {}) }), _jsx(Route, { path: "/reports", element: _jsx(DailyReports, {}) }), _jsx(Route, { path: "/optimizer", element: _jsx(Optimizer, {}) })] }) })] }) }));
}
