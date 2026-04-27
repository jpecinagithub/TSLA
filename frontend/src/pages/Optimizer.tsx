import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Play, CheckCircle, XCircle, Clock } from "lucide-react";
import { api } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OptRun {
  id: number;
  run_ts: string;
  bars_used: number;
  combinations_tested: number;
  best_params: Record<string, string>;
  baseline_pnl: number | null;
  best_pnl: number | null;
  improvement_pct: number | null;
  applied: boolean;
  apply_reason: string | null;
}
interface ParamChange {
  ts: string;
  key_name: string;
  old_value: string;
  new_value: string;
  changed_by: string;
}
interface OptimizerStatus { running: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const f  = (n: number | null | undefined, d = 2) => n != null ? n.toFixed(d) : "—";
const APEX_BASE = {
  chart:   { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme:   { mode: "dark" as const },
  grid:    { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

// Key params to track over time
const TRACKED = ["ema_fast", "ema_slow", "rsi_overbought", "vol_spike_mult",
                 "profit_target_pct", "stop_loss_pct"];

// ── Param evolution chart ─────────────────────────────────────────────────────
function ParamEvolution({ history }: { history: ParamChange[] }) {
  // Build one series per tracked param, plotting numeric value over time
  const series = TRACKED.map(key => {
    const pts = history
      .filter(c => c.key_name === key)
      .map(c => ({ x: new Date(c.ts).getTime(), y: parseFloat(c.new_value) }))
      .sort((a, b) => a.x - b.x);
    return { name: key, data: pts };
  }).filter(s => s.data.length > 0);

  if (series.length === 0) {
    return (
      <div className="h-[200px] grid place-items-center text-slate-600 text-sm">
        No parameter changes recorded yet
      </div>
    );
  }

  return (
    <ReactApexChart
      type="line" height={220}
      series={series}
      options={{
        ...APEX_BASE,
        stroke:  { curve: "stepline", width: 2 },
        markers: { size: 4 },
        xaxis:   { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:   { labels: { style: { colors: "#475569" } } },
        legend:  { position: "bottom", labels: { colors: "#64748b" }, fontSize: "11px" },
        tooltip: { ...APEX_BASE.tooltip, x: { format: "dd MMM HH:mm" } },
      }}
    />
  );
}

// ── PnL improvement chart ─────────────────────────────────────────────────────
function ImprovementChart({ runs }: { runs: OptRun[] }) {
  const data = [...runs]
    .reverse()
    .map(r => ({
      x: new Date(r.run_ts).getTime(),
      y: r.improvement_pct ?? 0,
    }));

  if (data.length === 0) {
    return (
      <div className="h-[160px] grid place-items-center text-slate-600 text-sm">
        No optimization runs yet
      </div>
    );
  }

  return (
    <ReactApexChart
      type="bar" height={160}
      series={[{ name: "Improvement %", data }]}
      options={{
        ...APEX_BASE,
        colors:      data.map(d => d.y >= 5 ? "#10b981" : d.y >= 0 ? "#f59e0b" : "#f43f5e"),
        plotOptions: { bar: { distributed: true, borderRadius: 3, columnWidth: "60%" } },
        legend:      { show: false },
        xaxis:       { type: "datetime", labels: { style: { colors: "#475569" } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:       { labels: { formatter: (v: number) => `${v.toFixed(1)}%`, style: { colors: "#475569" } } },
        tooltip:     { ...APEX_BASE.tooltip, x: { format: "dd MMM HH:mm" } },
        annotations: { yaxis: [{ y: 5, borderColor: "#10b981", borderWidth: 1, strokeDashArray: 4, label: { text: "apply threshold", style: { color: "#10b981", fontSize: "10px" } } }] },
      }}
    />
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────
function RunRow({ r }: { r: OptRun }) {
  const imp = r.improvement_pct ?? 0;
  const impColor = imp >= 5 ? "text-emerald-400" : imp >= 0 ? "text-amber-400" : "text-rose-400";

  return (
    <tr className="tr text-[12px]">
      <td className="td font-mono text-slate-500 whitespace-nowrap">
        {new Date(r.run_ts).toLocaleString()}
      </td>
      <td className="td text-center">{r.bars_used}</td>
      <td className="td text-center">{r.combinations_tested}</td>
      <td className="td font-mono">
        {r.baseline_pnl != null ? `${r.baseline_pnl >= 0 ? "+" : ""}$${f(r.baseline_pnl)}` : "—"}
      </td>
      <td className="td font-mono">
        {r.best_pnl != null ? `${r.best_pnl >= 0 ? "+" : ""}$${f(r.best_pnl)}` : "—"}
      </td>
      <td className={`td font-bold font-mono ${impColor}`}>
        {imp >= 0 ? "+" : ""}{f(r.improvement_pct)}%
      </td>
      <td className="td">
        {r.applied
          ? <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={12} /> Applied</span>
          : <span className="flex items-center gap-1 text-slate-600"><XCircle    size={12} /> Not applied</span>}
      </td>
      <td className="td text-slate-500 max-w-[200px] truncate" title={r.apply_reason ?? ""}>
        {r.apply_reason || "—"}
      </td>
    </tr>
  );
}

// ── Best params panel ─────────────────────────────────────────────────────────
function BestParamsPanel({ run }: { run: OptRun }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {TRACKED.map(k => {
        const val = run.best_params?.[k];
        return val ? (
          <div key={k} className="surface px-4 py-3">
            <div className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">{k.replace(/_/g," ")}</div>
            <div className="text-base font-bold font-mono text-emerald-400">{val}</div>
          </div>
        ) : null;
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Optimizer() {
  const qc = useQueryClient();

  const { data: runs = [], isLoading } = useQuery<OptRun[]>({
    queryKey: ["optimizer-history"],
    queryFn:  () => api.get("/optimizer/history?limit=20"),
    refetchInterval: 30_000,
  });

  const { data: paramHistory = [] } = useQuery<ParamChange[]>({
    queryKey: ["param-history"],
    queryFn:  () => api.get("/optimizer/param-history?limit=100"),
    refetchInterval: 60_000,
  });

  const { data: status } = useQuery<OptimizerStatus>({
    queryKey: ["optimizer-status"],
    queryFn:  () => api.get("/optimizer/status"),
    refetchInterval: 5_000,
  });

  const trigger = useMutation({
    mutationFn: () => api.post("/optimizer/run"),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["optimizer-status"] }),
  });

  const lastRun  = runs[0];
  const isRunning = status?.running ?? false;

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Parameter Optimizer</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Runs daily at 16:10 ET — grid search over 6 parameters · walk-forward validation
          </p>
        </div>
        <button
          onClick={() => trigger.mutate()}
          disabled={isRunning || trigger.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                     text-white text-[12px] font-semibold transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning
            ? <><Clock size={13} className="animate-spin" /> Running…</>
            : <><Play  size={13} /> Run Now</>}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Runs total",     val: String(runs.length),                        color: "text-white" },
          { label: "Applied",        val: String(runs.filter(r => r.applied).length), color: "text-emerald-400" },
          { label: "Best improvement", val: runs.length > 0 ? `+${f(Math.max(...runs.map(r=>r.improvement_pct??0)))}%` : "—", color: "text-emerald-400" },
          { label: "Last run",       val: lastRun ? new Date(lastRun.run_ts).toLocaleDateString() : "—", color: "text-white" },
        ].map(({ label, val, color }) => (
          <div key={label} className="surface px-5 py-4">
            <div className="label mb-2">{label}</div>
            <div className={`val-lg ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Best params from last run */}
      {lastRun && (
        <div className="surface overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2030] flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Best Params (last run)</span>
            {lastRun.applied
              ? <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle size={11} /> Auto-applied</span>
              : <span className="text-[11px] text-slate-500">Not applied ({f(lastRun.improvement_pct)}% improvement &lt; 5% threshold)</span>}
          </div>
          <div className="p-4">
            <BestParamsPanel run={lastRun} />
            {lastRun.apply_reason && (
              <p className="text-[11px] text-slate-500 mt-3">{lastRun.apply_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Improvement history chart */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Improvement per Run</span>
          <span className="text-[11px] text-slate-500 ml-2">(green = auto-applied)</span>
        </div>
        <div className="p-4">
          <ImprovementChart runs={runs} />
        </div>
      </div>

      {/* Parameter evolution */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Parameter Evolution</span>
          <span className="text-[11px] text-slate-500 ml-2">step-line — value at each change</span>
        </div>
        <div className="p-4">
          <ParamEvolution history={paramHistory} />
        </div>
      </div>

      {/* Run history table */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2030]">
          <span className="text-sm font-semibold text-white">Run History</span>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-slate-600 text-sm">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="py-10 text-center text-slate-600 text-sm">No optimization runs yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a2030]">
                  {["Run at", "Bars", "Combos", "Baseline PnL", "Best PnL", "Improvement", "Status", "Notes"].map(h => (
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map(r => <RunRow key={r.id} r={r} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
