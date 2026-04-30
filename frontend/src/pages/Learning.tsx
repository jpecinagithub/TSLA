import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { Brain, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Regime {
  regime: string; confidence: string;
  adx: number | null; ema50: number | null; price: number;
  recommended_strategy: string | null; ts: string;
}
interface Snapshot {
  week_start: string; total_trades: number;
  win_rate: number | null; profit_factor: number | null;
  expectancy: number | null; avg_hold_minutes: number | null;
  agent_pnl: number | null; bnh_pnl: number | null;
  alpha: number | null; regime_at_week: string;
}
interface Verdict {
  verdict: string; label: string; detail: string;
  color: string; weeks_data: number;
}
interface LearningStatus {
  regime: Regime; verdict: Verdict;
  current_week: Snapshot | null; snapshots: Snapshot[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const f   = (n: number | null | undefined, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const sgn = (n: number | null) => n != null && n >= 0 ? "+" : "";
const APEX = {
  chart:   { background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
  theme:   { mode: "dark" as const },
  grid:    { borderColor: "#1a2030" },
  tooltip: { theme: "dark" as const },
};

// ── Verdict banner ────────────────────────────────────────────────────────────
const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  LEARNING:     { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: "🧠" },
  WEAK_SIGNAL:  { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400",   icon: "🟡" },
  NO_LEARNING:  { bg: "bg-rose-500/10",    border: "border-rose-500/30",    text: "text-rose-400",    icon: "❌" },
  TOO_EARLY:    { bg: "bg-blue-500/10",    border: "border-blue-500/30",    text: "text-blue-400",    icon: "⏳" },
  NO_DATA:      { bg: "bg-slate-500/10",   border: "border-slate-500/30",   text: "text-slate-400",   icon: "📭" },
};

function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLES[verdict.verdict] ?? VERDICT_STYLES.NO_DATA;
  return (
    <div className={`rounded-xl border px-6 py-5 ${s.bg} ${s.border}`}>
      <div className="flex items-start gap-4">
        <span className="text-3xl">{s.icon}</span>
        <div>
          <div className={`text-lg font-bold ${s.text}`}>{verdict.label}</div>
          <div className="text-sm text-slate-400 mt-1">{verdict.detail}</div>
          <div className="text-[11px] text-slate-600 mt-2">
            Basado en {verdict.weeks_data} semana{verdict.weeks_data !== 1 ? "s" : ""} de datos
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────
const REGIME_META: Record<string, { label: string; color: string; bg: string; Icon: typeof TrendingUp; detail: string }> = {
  TRENDING_UP:   { label: "Tendencia alcista", color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: TrendingUp,  detail: "EMA cruce activo — estrategia EMA Crossover recomendada" },
  TRENDING_DOWN: { label: "Tendencia bajista", color: "text-rose-400",    bg: "bg-rose-500/10",    Icon: TrendingDown, detail: "Mercado bajista — sin operaciones long recomendadas" },
  RANGING:       { label: "Mercado lateral",   color: "text-amber-400",   bg: "bg-amber-500/10",   Icon: Minus,        detail: "Sin tendencia clara — VWAP Momentum puede tener ventaja" },
  UNKNOWN:       { label: "Desconocido",        color: "text-slate-400",   bg: "bg-slate-500/10",   Icon: AlertCircle,  detail: "Datos insuficientes para clasificar el mercado" },
};

function RegimeCard({ regime }: { regime: Regime }) {
  const meta = REGIME_META[regime.regime] ?? REGIME_META.UNKNOWN;
  const { Icon } = meta;
  return (
    <div className="surface overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1a2030]">
        <span className="text-sm font-semibold text-white">Régimen actual</span>
      </div>
      <div className={`p-5 ${meta.bg} flex items-center gap-4`}>
        <div className={`w-12 h-12 rounded-xl grid place-items-center ${meta.bg} border border-[#1e2535]`}>
          <Icon size={22} className={meta.color} />
        </div>
        <div className="flex-1">
          <div className={`text-base font-bold ${meta.color}`}>{meta.label}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{meta.detail}</div>
        </div>
        <div className="text-right">
          <div className="label">ADX</div>
          <div className="text-sm font-bold text-white">{f(regime.adx, 1)}</div>
          <div className="label mt-1">Confianza</div>
          <div className={`text-[12px] font-semibold ${meta.color}`}>{regime.confidence}</div>
        </div>
      </div>
      <div className="px-5 py-3 grid grid-cols-3 gap-4 text-[12px] border-t border-[#1a2030]">
        <div><div className="label mb-1">Precio actual</div><div className="font-mono font-bold text-white">${f(regime.price)}</div></div>
        <div><div className="label mb-1">EMA 50</div><div className="font-mono text-blue-400">{f(regime.ema50)}</div></div>
        <div><div className="label mb-1">Estrategia recomendada</div>
          <div className="font-semibold text-amber-400">{regime.recommended_strategy ?? "Ninguna"}</div></div>
      </div>
    </div>
  );
}

// ── Expectancy chart ──────────────────────────────────────────────────────────
function ExpectancyChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots
    .filter(s => s.expectancy != null)
    .map(s => ({ x: s.week_start, y: Number(s.expectancy!.toFixed(2)) }));

  if (data.length === 0)
    return <div className="py-12 text-center text-slate-600 text-sm">Sin datos aún — vuelve la próxima semana</div>;

  const isPositive = data.length > 0 && data[data.length - 1].y >= 0;
  return (
    <ReactApexChart type="line" height={180} series={[{ name: "Expectativa $/trade", data }]}
      options={{
        ...APEX,
        colors: [isPositive ? "#10b981" : "#f43f5e"],
        stroke: { curve: "smooth", width: 2 },
        markers: { size: 5 },
        xaxis:  { type: "category", labels: { style: { colors: "#475569" }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:  { labels: { formatter: (v: number) => `$${v.toFixed(1)}`, style: { colors: "#475569" } } },
        annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1, strokeDashArray: 4 }] },
      }} />
  );
}

// ── Alpha chart ───────────────────────────────────────────────────────────────
function AlphaChart({ snapshots }: { snapshots: Snapshot[] }) {
  const weeks   = snapshots.map(s => s.week_start);
  const agent   = snapshots.map(s => Number((s.agent_pnl ?? 0).toFixed(2)));
  const bnh     = snapshots.map(s => Number((s.bnh_pnl ?? 0).toFixed(2)));

  if (weeks.length === 0)
    return <div className="py-12 text-center text-slate-600 text-sm">Sin datos aún</div>;

  return (
    <ReactApexChart type="bar" height={180}
      series={[{ name: "Agente", data: agent }, { name: "Buy & Hold", data: bnh }]}
      options={{
        ...APEX,
        colors:      ["#3b82f6", "#475569"],
        plotOptions: { bar: { columnWidth: "60%", borderRadius: 2 } },
        xaxis:       { categories: weeks, labels: { style: { colors: "#475569" }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis:       { labels: { formatter: (v: number) => `$${v.toFixed(0)}`, style: { colors: "#475569" } } },
        dataLabels:  { enabled: false },
        legend:      { position: "top", labels: { colors: "#94a3b8" }, fontSize: "11px" },
        annotations: { yaxis: [{ y: 0, borderColor: "#334155", borderWidth: 1 }] },
      }} />
  );
}

// ── Weekly table ──────────────────────────────────────────────────────────────
function WeeklyTable({ snapshots, current }: { snapshots: Snapshot[]; current: Snapshot | null }) {
  const all = current ? [...snapshots, { ...current, week_start: current.week_start + " (actual)" }] : snapshots;
  if (all.length === 0)
    return <div className="py-12 text-center text-slate-600 text-sm">Sin datos semanales aún</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1a2030]">
            {["Semana","Trades","Win%","PF","Expectativa","PnL Agente","B&H","Alpha","Régimen"]
              .map(h => <th key={h} className="th">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...all].reverse().map(s => {
            const alphaUp = (s.alpha ?? 0) >= 0;
            const expUp   = (s.expectancy ?? 0) >= 0;
            return (
              <tr key={s.week_start} className="tr">
                <td className="td font-mono text-[12px] text-slate-400 whitespace-nowrap">{s.week_start}</td>
                <td className="td text-center">{s.total_trades}</td>
                <td className={`td text-center font-mono text-[12px] font-semibold ${(s.win_rate??0)>=50?"text-emerald-400":"text-rose-400"}`}>{f(s.win_rate,1)}%</td>
                <td className={`td text-center font-mono text-[12px] font-semibold ${(s.profit_factor??0)>=1?"text-emerald-400":"text-rose-400"}`}>{f(s.profit_factor)}</td>
                <td className={`td text-center font-mono text-[12px] font-semibold ${expUp?"text-emerald-400":"text-rose-400"}`}>{sgn(s.expectancy)}${f(s.expectancy)}</td>
                <td className={`td text-center font-mono text-[12px] ${(s.agent_pnl??0)>=0?"text-emerald-400":"text-rose-400"}`}>{sgn(s.agent_pnl)}${f(s.agent_pnl)}</td>
                <td className="td text-center font-mono text-[12px] text-slate-400">{sgn(s.bnh_pnl)}${f(s.bnh_pnl)}</td>
                <td className={`td text-center font-mono text-[12px] font-bold ${alphaUp?"text-emerald-400":"text-rose-400"}`}>{sgn(s.alpha)}${f(s.alpha)}</td>
                <td className="td text-center text-[11px] text-slate-500">{s.regime_at_week}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Learning() {
  const { data, isLoading } = useQuery<LearningStatus>({
    queryKey:      ["learning-status"],
    queryFn:       () => api.get("/learning/status"),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain size={18} className="text-blue-400" />
        <div>
          <h1 className="text-base font-bold text-white">¿Está aprendiendo el agente?</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Seguimiento semanal de expectativa, alpha vs buy &amp; hold y régimen de mercado
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="surface py-16 text-center text-slate-500 text-sm">Cargando métricas…</div>
      )}

      {data && (
        <>
          {/* Verdict */}
          <VerdictBanner verdict={data.verdict} />

          {/* Regime + KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <RegimeCard regime={data.regime} />
            </div>

            {/* Mini KPI cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Semanas datos",    val: String(data.verdict.weeks_data),      color: "text-white" },
                { label: "Trades totales",   val: data.snapshots.reduce((a,s) => a + s.total_trades, 0).toString(), color: "text-white" },
                { label: "Alpha acumulado",
                  val: `${(data.snapshots.reduce((a,s)=>a+(s.alpha??0),0)>=0)?"+":""}$${data.snapshots.reduce((a,s)=>a+(s.alpha??0),0).toFixed(2)}`,
                  color: data.snapshots.reduce((a,s)=>a+(s.alpha??0),0) >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: "Expectativa media",
                  val: (() => { const e = data.snapshots.filter(s=>s.expectancy!=null); const m = e.length ? e.reduce((a,s)=>a+(s.expectancy!),0)/e.length : null; return m!=null?`${m>=0?"+":""}$${m.toFixed(2)}`:"—" })(),
                  color: "text-amber-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="surface px-4 py-3">
                  <div className="label mb-1">{label}</div>
                  <div className={`text-base font-bold font-mono ${color}`}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Expectancy curve */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Curva de aprendizaje</span>
              <span className="text-[11px] text-slate-500 ml-2">expectativa $/trade por semana — tendencia al alza = aprendizaje</span>
            </div>
            <div className="p-4"><ExpectancyChart snapshots={data.snapshots} /></div>
          </div>

          {/* Alpha chart */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Agente vs Buy &amp; Hold</span>
              <span className="text-[11px] text-slate-500 ml-2">¿el agente añade valor sobre simplemente mantener TSLA?</span>
            </div>
            <div className="p-4"><AlphaChart snapshots={data.snapshots} /></div>
          </div>

          {/* Weekly table */}
          <div className="surface overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a2030]">
              <span className="text-sm font-semibold text-white">Historial semanal</span>
              <span className="text-[11px] text-slate-500 ml-2">cada fila = una semana de trading real</span>
            </div>
            <WeeklyTable snapshots={data.snapshots} current={data.current_week} />
          </div>
        </>
      )}
    </div>
  );
}
