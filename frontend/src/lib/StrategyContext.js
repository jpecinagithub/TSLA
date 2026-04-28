import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from "react";
export const STRATEGIES = [
    { value: "ema_crossover", label: "EMA Crossover", short: "EMA", color: "text-blue-400" },
    { value: "momentum_breakout", label: "Momentum Breakout", short: "MOM", color: "text-amber-400" },
    { value: "vwap_momentum", label: "VWAP Momentum", short: "VWAP", color: "text-violet-400" },
];
const StrategyContext = createContext({
    strategy: "ema_crossover",
    setStrategy: () => { },
});
export function StrategyProvider({ children }) {
    const [strategy, setStrategy] = useState("ema_crossover");
    return (_jsx(StrategyContext.Provider, { value: { strategy, setStrategy }, children: children }));
}
export function useStrategy() {
    return useContext(StrategyContext);
}
