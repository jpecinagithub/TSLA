import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RefreshCw } from "lucide-react";
import Badge from "../components/Badge";
import { api } from "../lib/api";

interface Signal {
  id: number; ts: string; signal_type: string; price: number;
  ema9: number|null; ema21: number|null; rsi14: number|null;
  vwap: number|null; vol_ratio: number|null;
  risk_pass: boolean; risk_reason: string; action_taken: string; reason: string;
}

const f = (n: number|null, d = 2) => n != null ? n.toFixed(d) : "—";
const FILTERS = ["ALL", "BUY", "SELL", "HOLD"] as const;

export default function DecisionLog() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch]         = useState("");

  const { data: signals = [], isLoading, refetch, isFetching } = useQuery<Signal[]>({
    queryKey: ["signals"],
    queryFn:  () => api.get("/signals?limit=500"),
    refetchInterval: 30_000,
  });

  const rows = signals.filter(s =>
    (typeFilter === "ALL" || s.signal_type === typeFilter) &&
    (search === "" || s.reason.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = Object.fromEntries(
    ["BUY","SELL","HOLD"].map(t => [t, signals.filter(s => s.signal_type === t).length])
  );

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Decision Log</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Every signal evaluated by the strategy engine with full indicator snapshot
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-[#111520] border border-[#1e2535] rounded-lg p-0.5 gap-0.5">
          {FILTERS.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                typeFilter === t
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
              {t !== "ALL" && (
                <span className="ml-1.5 text-[11px] opacity-60">{counts[t] ?? 0}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          <input
            className="input-field pl-8 h-9 w-52 text-[12px]"
            placeholder="Filter by reason…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[11px] text-slate-600">{rows.length} / {signals.length}</span>
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1a2030]">
                <th className="th">Time</th>
                <th className="th">Signal</th>
                <th className="th">Price</th>
                <th className="th">EMA 9</th>
                <th className="th">EMA 21</th>
                <th className="th">RSI</th>
                <th className="th">Vol ×</th>
                <th className="th">VWAP</th>
                <th className="th">Risk</th>
                <th className="th">Action</th>
                <th className="th">Reason</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={11} className="td text-center py-16 text-slate-600">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="td text-center py-16">
                    <div className="text-slate-600 text-sm">No signals yet</div>
                    <div className="text-slate-700 text-xs mt-1">The agent will generate signals during market hours (09:30–16:00 ET)</div>
                  </td>
                </tr>
              )}
              {rows.map(s => (
                <tr key={s.id} className="tr">
                  <td className="td whitespace-nowrap">
                    <div className="font-mono text-[12px] text-slate-300">{new Date(s.ts).toLocaleTimeString()}</div>
                    <div className="text-[11px] text-slate-600">{new Date(s.ts).toLocaleDateString()}</div>
                  </td>
                  <td className="td"><Badge value={s.signal_type} /></td>
                  <td className="td font-mono font-semibold text-white">${f(s.price)}</td>
                  <td className="td font-mono text-[12px] text-blue-400">{f(s.ema9)}</td>
                  <td className="td font-mono text-[12px] text-amber-400">{f(s.ema21)}</td>
                  <td className={`td font-mono text-[12px] ${s.rsi14 != null && s.rsi14 > 70 ? "text-rose-400 font-semibold" : "text-slate-300"}`}>
                    {f(s.rsi14, 1)}
                  </td>
                  <td className={`td font-mono text-[12px] ${s.vol_ratio != null && s.vol_ratio >= 1.5 ? "text-emerald-400 font-semibold" : "text-slate-300"}`}>
                    {f(s.vol_ratio, 2)}×
                  </td>
                  <td className="td font-mono text-[12px] text-violet-400">{f(s.vwap)}</td>
                  <td className="td">
                    <span className={`text-[11px] font-semibold ${s.risk_pass ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.risk_pass ? "✓ pass" : "✗ fail"}
                    </span>
                  </td>
                  <td className="td"><Badge value={s.action_taken} /></td>
                  <td className="td text-[12px] text-slate-500 max-w-[180px] truncate" title={s.reason}>{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
