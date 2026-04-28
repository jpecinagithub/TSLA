import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import {
  Activity, BarChart2, BookOpen, ClipboardList,
  Settings, Sliders, TrendingUp, Zap, GitCompare,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useLive } from "./lib/useLive";
import { StrategyProvider, useStrategy } from "./lib/StrategyContext";
import StrategySelector from "./components/StrategySelector";
import LiveMonitor   from "./pages/LiveMonitor";
import DecisionLog   from "./pages/DecisionLog";
import TradeHistory  from "./pages/TradeHistory";
import Parameters    from "./pages/Parameters";
import Performance   from "./pages/Performance";
import DailyReports  from "./pages/DailyReports";
import Optimizer     from "./pages/Optimizer";
import Comparison    from "./pages/Comparison";

interface Portfolio { capital: number; daily_pnl: number; pnl_pct: number; }

const NAV = [
  { to: "/",            label: "Live",        Icon: Activity      },
  { to: "/decisions",   label: "Decisions",   Icon: ClipboardList },
  { to: "/trades",      label: "Trades",      Icon: BarChart2     },
  { to: "/parameters",  label: "Parameters",  Icon: Settings      },
  { to: "/performance", label: "Performance", Icon: TrendingUp    },
  { to: "/reports",     label: "Reports",     Icon: BookOpen      },
  { to: "/optimizer",   label: "Optimizer",   Icon: Sliders       },
  { to: "/comparison",  label: "Comparison",  Icon: GitCompare    },
];

function f(n?: number | null, d = 2) { return n != null ? n.toFixed(d) : "—"; }

function AppInner() {
  const { connected } = useLive();
  const { strategy }  = useStrategy();

  const { data: port } = useQuery<Portfolio>({
    queryKey: ["portfolio", strategy],
    queryFn:  () => api.get(`/portfolio?strategy=${strategy}`),
    refetchInterval: 15_000,
  });
  const dailyUp = (port?.daily_pnl ?? 0) >= 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0d14]">

      {/* ── ROW 1: brand + strategy selector + status ── */}
      <div className="shrink-0 h-12 flex items-center justify-between px-5
                      bg-[#0d1117] border-b border-[#1a2030]">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-blue-600 grid place-items-center">
            <Zap size={12} className="text-white" fill="white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">TSLA Agent</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold
                           bg-amber-500/10 text-amber-400 border border-amber-500/20">
            PAPER
          </span>
        </div>

        {/* Strategy selector — centre */}
        <StrategySelector />

        {/* Account summary + live indicator */}
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="label">Capital</div>
            <div className="text-sm font-bold text-white tabular-nums">${f(port?.capital)}</div>
          </div>
          <div className="text-right">
            <div className="label">Today</div>
            <div className={`text-sm font-bold tabular-nums ${dailyUp ? "text-emerald-400" : "text-rose-400"}`}>
              {dailyUp ? "+" : ""}${f(port?.daily_pnl)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
            <span className={connected ? "text-emerald-400" : "text-rose-400"}>
              {connected ? "Live" : "Off"}
            </span>
          </div>
        </div>
      </div>

      {/* ── ROW 2: navigation tabs ── */}
      <nav className="shrink-0 h-10 flex items-center gap-0.5 px-3
                      bg-[#0d1117] border-b border-[#1a2030] overflow-x-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {({ isActive }) => (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium
                               whitespace-nowrap transition-all cursor-pointer
                               ${isActive
                                 ? "text-white bg-blue-600/20 border border-blue-500/20"
                                 : "text-slate-500 hover:text-slate-200 hover:bg-white/5"}`}>
                <Icon size={13} />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── CONTENT ── */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"            element={<LiveMonitor />} />
          <Route path="/decisions"   element={<DecisionLog />} />
          <Route path="/trades"      element={<TradeHistory />} />
          <Route path="/parameters"  element={<Parameters />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/reports"     element={<DailyReports />} />
          <Route path="/optimizer"   element={<Optimizer />} />
          <Route path="/comparison"  element={<Comparison />} />
        </Routes>
      </main>

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/tsla">
      <StrategyProvider>
        <AppInner />
      </StrategyProvider>
    </BrowserRouter>
  );
}
