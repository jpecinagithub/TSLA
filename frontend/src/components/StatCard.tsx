import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, sub, trend = "neutral", icon }: Props) {
  const color = trend === "up" ? "text-emerald-400"
              : trend === "down" ? "text-rose-400"
              : "text-white";
  return (
    <div className="surface px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>
      <div className={`val-lg ${color}`}>{value}</div>
      {(sub || trend !== "neutral") && (
        <div className="flex items-center gap-1.5">
          {trend === "up"   && <TrendingUp  size={12} className="text-emerald-400" />}
          {trend === "down" && <TrendingDown size={12} className="text-rose-400" />}
          {sub && <span className="text-[12px] text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}
