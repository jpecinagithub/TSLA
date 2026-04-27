import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp,
         Info, RefreshCw, XCircle } from "lucide-react";
import { api } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Recommendation {
  priority: "high" | "medium" | "low" | "info";
  param: string;
  current: string;
  suggested: string;
  reason: string;
}
interface ErrorItem {
  type: string;
  severity: "high" | "medium" | "low";
  trade_id?: number;
  ts?: string;
  detail: string;
}
interface Analysis {
  summary:  { total_signals: number; buy_signals: number; sell_signals: number; hold_signals: number; trades_opened: number; trades_closed: number; bars_collected: number };
  pnl:      { daily_pnl: number; capital_end: number | null };
  performance: { win_count: number; loss_count: number; win_rate: number; avg_win: number; avg_loss: number; exit_reasons: Record<string,number>; best_trade: {id:number;pnl:number}|null; worst_trade: {id:number;pnl:number}|null };
  errors:               ErrorItem[];
  missed_opportunities: ErrorItem[];
  recommendations:      Recommendation[];
  param_snapshot:       Record<string, string>;
}
interface Report {
  id: number;
  date: string;
  generated_at: string;
  total_signals: number;
  buy_signals: number;
  sell_signals: number;
  trades_closed: number;
  daily_pnl: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  recommendations: Recommendation[];
  analysis: Analysis;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const f = (n: number | null | undefined, d = 2) => n != null ? n.toFixed(d) : "—";

const PRIORITY_COLOR: Record<string, string> = {
  high:   "text-rose-400 border-rose-500/30 bg-rose-500/5",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  low:    "text-sky-400   border-sky-500/30   bg-sky-500/5",
  info:   "text-slate-400 border-slate-500/20 bg-slate-500/5",
};
const SEVERITY_ICON: Record<string, JSX.Element> = {
  high:   <XCircle     size={13} className="text-rose-400  shrink-0" />,
  medium: <AlertTriangle size={13} className="text-amber-400 shrink-0" />,
  low:    <Info        size={13} className="text-sky-400   shrink-0" />,
};

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string,string> = {
    high: "bg-rose-500/15 text-rose-400", medium: "bg-amber-500/15 text-amber-400",
    low:  "bg-sky-500/15  text-sky-400",  info:   "bg-slate-500/15 text-slate-400",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${map[p] ?? map.info}`}>
      {p}
    </span>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function ReportDetail({ a }: { a: Analysis }) {
  const [showParams, setShowParams] = useState(false);
  const { summary, pnl, performance: perf, errors, missed_opportunities: missed, recommendations: recs } = a;

  return (
    <div className="border-t border-[#1a2030] bg-[#080b10] p-5 flex flex-col gap-5">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Signals",  val: summary.total_signals,   color: "text-white" },
          { label: "Trades",   val: summary.trades_closed,   color: "text-white" },
          { label: "Win Rate", val: `${f(perf.win_rate)}%`,  color: perf.win_rate >= 50 ? "text-emerald-400" : "text-rose-400" },
          { label: "Capital",  val: pnl.capital_end != null ? `$${f(pnl.capital_end)}` : "—", color: "text-white" },
        ].map(({ label, val, color }) => (
          <div key={label} className="surface px-4 py-3">
            <div className="label mb-1">{label}</div>
            <div className={`text-sm font-bold ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Exit reasons */}
      {Object.keys(perf.exit_reasons || {}).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(perf.exit_reasons).map(([k, v]) => (
            <div key={k} className="surface px-3 py-2 flex items-center gap-2">
              <span className="text-[11px] text-slate-500 uppercase">{k}</span>
              <span className="text-sm font-bold text-white">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Errors Detected ({errors.length})
          </div>
          <div className="flex flex-col gap-2">
            {errors.map((e, i) => (
              <div key={i} className={`border rounded-lg px-3 py-2.5 flex gap-2 ${PRIORITY_COLOR[e.severity] ?? PRIORITY_COLOR.info}`}>
                {SEVERITY_ICON[e.severity] ?? <Info size={13} className="shrink-0" />}
                <div className="flex-1">
                  <span className="text-[11px] font-bold uppercase mr-2">{e.type.replace(/_/g," ")}</span>
                  {e.trade_id && <span className="text-[10px] text-slate-500 mr-2">Trade #{e.trade_id}</span>}
                  <span className="text-[12px]">{e.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missed opportunities */}
      {missed.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Missed Opportunities ({missed.length})
          </div>
          <div className="flex flex-col gap-2">
            {missed.map((m, i) => (
              <div key={i} className="border border-slate-700/40 bg-slate-800/20 rounded-lg px-3 py-2.5 flex gap-2">
                <Info size={13} className="text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] font-bold uppercase text-slate-400 mr-2">{m.type.replace(/_/g," ")}</span>
                  {m.ts && <span className="text-[10px] text-slate-600 mr-2">{new Date(m.ts).toLocaleTimeString()}</span>}
                  <span className="text-[12px] text-slate-300">{m.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Recommendations
          </div>
          <div className="flex flex-col gap-2">
            {recs.map((r, i) => (
              <div key={i} className={`border rounded-lg px-3 py-2.5 ${PRIORITY_COLOR[r.priority]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge p={r.priority} />
                  {r.param !== "none" && r.param !== "strategy" && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {r.param}: <span className="text-white">{r.current}</span>
                      {r.suggested !== "—" && <> → <span className="text-emerald-400">{r.suggested}</span></>}
                    </span>
                  )}
                </div>
                <div className="text-[12px]">{r.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Param snapshot toggle */}
      <button
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors w-fit"
        onClick={() => setShowParams(v => !v)}
      >
        {showParams ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Parameters snapshot
      </button>
      {showParams && (
        <div className="surface p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[11px]">
          {Object.entries(a.param_snapshot || {}).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-slate-500 truncate">{k}</span>
              <span className="font-mono text-white">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────
function ReportCard({ r }: { r: Report }) {
  const [open, setOpen] = useState(false);
  const up = r.daily_pnl >= 0;
  const topRec = r.recommendations?.[0];

  return (
    <div className="surface overflow-hidden">
      <button
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        {/* Date */}
        <div className="w-24 shrink-0">
          <div className="text-sm font-bold text-white">{r.date}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {new Date(r.generated_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>

        {/* PnL */}
        <div className="w-20 shrink-0">
          <div className={`text-sm font-bold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>
            {up ? "+" : ""}${f(r.daily_pnl)}
          </div>
          <div className="text-[10px] text-slate-600">daily PnL</div>
        </div>

        {/* Win rate */}
        <div className="w-20 shrink-0">
          <div className={`text-sm font-bold ${r.win_rate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
            {f(r.win_rate)}%
          </div>
          <div className="text-[10px] text-slate-600">{r.win_count}W / {r.loss_count}L</div>
        </div>

        {/* Signals / Trades */}
        <div className="w-24 shrink-0 text-[12px] text-slate-500">
          <div><span className="text-emerald-400 font-mono">{r.buy_signals}</span> BUY · <span className="text-rose-400 font-mono">{r.sell_signals}</span> SELL</div>
          <div className="text-[10px] mt-0.5">{r.trades_closed} trades</div>
        </div>

        {/* Top recommendation preview */}
        {topRec && (
          <div className="flex-1 min-w-0 hidden sm:block">
            <div className="flex items-center gap-1.5">
              <PriorityBadge p={topRec.priority} />
              <span className="text-[11px] text-slate-400 truncate">{topRec.reason}</span>
            </div>
          </div>
        )}

        {/* Expand icon */}
        <div className="ml-auto shrink-0 text-slate-600">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && r.analysis && <ReportDetail a={r.analysis} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DailyReports() {
  const qc = useQueryClient();

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["reports"],
    queryFn:  () => api.get("/reports?limit=30"),
    refetchInterval: 60_000,
  });

  const generate = useMutation({
    mutationFn: () => api.post("/reports/generate"),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const totalPnl = reports.reduce((s, r) => s + r.daily_pnl, 0);
  const allWins  = reports.reduce((s, r) => s + r.win_count, 0);
  const allLoss  = reports.reduce((s, r) => s + r.loss_count, 0);
  const avgWR    = reports.length > 0
    ? reports.reduce((s, r) => s + r.win_rate, 0) / reports.length
    : 0;

  return (
    <div className="p-5 flex flex-col gap-5">

      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-white">Daily Reports</h1>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30
                     text-blue-400 text-[12px] font-semibold hover:bg-blue-600/30 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={generate.isPending ? "animate-spin" : ""} />
          Generate today's report
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Reports",    val: String(reports.length),          color: "text-white" },
          { label: "Total PnL",  val: `${totalPnl>=0?"+":""}$${f(totalPnl)}`, color: totalPnl>=0?"text-emerald-400":"text-rose-400" },
          { label: "Avg Win Rate", val: `${f(avgWR)}%`,                color: avgWR>=50?"text-emerald-400":"text-rose-400" },
          { label: "All Trades", val: `${allWins}W / ${allLoss}L`,     color: "text-slate-300" },
        ].map(({ label, val, color }) => (
          <div key={label} className="surface px-5 py-4">
            <div className="label mb-2">{label}</div>
            <div className={`val-lg ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Report list */}
      {isLoading ? (
        <div className="surface py-16 text-center text-slate-600 text-sm">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="surface py-16 text-center">
          <div className="text-slate-500 text-sm">No reports yet.</div>
          <div className="text-slate-600 text-[12px] mt-1">Reports generate automatically at 16:05 ET on trading days.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map(r => <ReportCard key={r.id} r={r} />)}
        </div>
      )}

    </div>
  );
}
