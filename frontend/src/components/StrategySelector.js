import { jsx as _jsx } from "react/jsx-runtime";
import { useStrategy, STRATEGIES } from "../lib/StrategyContext";
export default function StrategySelector() {
    const { strategy, setStrategy } = useStrategy();
    ;
    return (_jsx("div", { className: "flex items-center gap-1.5 bg-[#111520] border border-[#1e2535]\n                    rounded-lg px-1 py-0.5", children: STRATEGIES.map(s => (_jsx("button", { onClick: () => setStrategy(s.value), title: s.label, className: `px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide
                      transition-all whitespace-nowrap
                      ${strategy === s.value
                ? `bg-[#1a2235] ${s.color} border border-white/10`
                : "text-slate-600 hover:text-slate-300"}`, children: s.short }, s.value))) }));
}
