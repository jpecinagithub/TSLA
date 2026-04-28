import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RotateCcw, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useStrategy, STRATEGIES } from "../lib/StrategyContext";

interface Param { key: string; value: string; description: string; updated_at: string; }

const GROUPS_BASE: Record<string, { keys: string[]; color: string }> = {
  "EMA Strategy":  { keys: ["ema_fast", "ema_slow"],                                              color: "text-blue-400"    },
  "RSI":           { keys: ["rsi_period", "rsi_overbought", "rsi_oversold"],                      color: "text-violet-400"  },
  "Volume":        { keys: ["vol_spike_mult"],                                                    color: "text-emerald-400" },
  "Trade Targets": { keys: ["profit_target_pct", "stop_loss_pct"],                               color: "text-amber-400"   },
  "Risk Control":  { keys: ["max_risk_pct", "max_daily_loss_pct", "max_trades_day", "slippage_pct"], color: "text-rose-400" },
};

// Strategy-specific extra groups
const GROUPS_EXTRA: Record<string, Record<string, { keys: string[]; color: string }>> = {
  momentum_breakout: {
    "Breakout Settings": { keys: ["breakout_window", "rsi_momentum_min", "rsi_exit_level"], color: "text-amber-400" },
  },
  vwap_momentum: {
    "VWAP Settings": { keys: ["rsi_momentum_min", "vwap_exit_buffer"], color: "text-violet-400" },
  },
};

export default function Parameters() {
  const { strategy } = useStrategy();
  const qc = useQueryClient();

  const { data: params = [], isLoading } = useQuery<Param[]>({
    queryKey: ["parameters", strategy],
    queryFn:  () => api.get(`/parameters?strategy=${strategy}`),
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/parameters/${key}?strategy=${strategy}`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parameters", strategy] }),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const map    = Object.fromEntries(params.map(p => [p.key, p]));
  const dirty  = Object.keys(draft).filter(k => draft[k] !== map[k]?.value);

  const val      = (k: string) => draft[k] ?? map[k]?.value ?? "";
  const isDirty  = (k: string) => draft[k] !== undefined && draft[k] !== map[k]?.value;
  const resetKey = (k: string) => setDraft(p => { const n = {...p}; delete n[k]; return n; });
  const saveAll  = () => { dirty.forEach(k => mutation.mutate({ key: k, value: draft[k] })); setDraft({}); };

  const strategyMeta  = STRATEGIES.find(s => s.value === strategy)!;
  const extraGroups   = GROUPS_EXTRA[strategy] ?? {};
  const allGroups     = { ...GROUPS_BASE, ...extraGroups };

  const renderParam = (key: string, color: string) => {
    const p = map[key];
    if (!p) return null;
    const dirtyKey = isDirty(key);
    return (
      <div key={key} className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`font-mono text-[12px] font-semibold ${color}`}>{key}</span>
            {dirtyKey && <span className="pill-amber text-[10px]">unsaved</span>}
          </div>
          <div className="text-[11px] text-slate-600 leading-tight">{p.description}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            className="input-field w-24 text-right text-sm font-mono h-8"
            value={val(key)}
            onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
          />
          {dirtyKey && (
            <button onClick={() => resetKey(key)} className="text-slate-600 hover:text-slate-300 transition-colors p-1" title="Reset">
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Strategy Parameters</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Editing <span className={`font-semibold ${strategyMeta.color}`}>{strategyMeta.label}</span>
            {" — "}changes take effect on the next 1-min bar
          </p>
        </div>
        {dirty.length > 0 && (
          <button onClick={saveAll} disabled={mutation.isPending} className="btn-primary">
            <Save size={14} />
            Save {dirty.length} change{dirty.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Object.entries(allGroups).map(([group, { keys, color }]) => (
            <div key={group} className="surface overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a2030]">
                <ChevronRight size={13} className={color} />
                <span className="text-[13px] font-semibold text-white">{group}</span>
              </div>
              <div className="divide-y divide-[#1a2030]">
                {keys.map(key => renderParam(key, color))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mutation.isError && (
        <div className="surface border-rose-500/30 px-5 py-3 text-rose-400 text-sm">
          Error saving — check backend logs.
        </div>
      )}
      {mutation.isSuccess && !mutation.isPending && (
        <div className="surface border-emerald-500/30 px-5 py-3 text-emerald-400 text-sm">
          Parameters saved successfully.
        </div>
      )}

    </div>
  );
}
