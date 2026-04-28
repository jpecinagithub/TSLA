import { createContext, useContext, useState, ReactNode } from "react";

export type Strategy = "ema_crossover" | "momentum_breakout" | "vwap_momentum";

export const STRATEGIES: { value: Strategy; label: string; short: string; color: string }[] = [
  { value: "ema_crossover",     label: "EMA Crossover",     short: "EMA",  color: "text-blue-400"    },
  { value: "momentum_breakout", label: "Momentum Breakout", short: "MOM",  color: "text-amber-400"   },
  { value: "vwap_momentum",     label: "VWAP Momentum",     short: "VWAP", color: "text-violet-400"  },
];

interface StrategyContextValue {
  strategy:    Strategy;
  setStrategy: (s: Strategy) => void;
}

const StrategyContext = createContext<StrategyContextValue>({
  strategy:    "ema_crossover",
  setStrategy: () => {},
});

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [strategy, setStrategy] = useState<Strategy>("ema_crossover");
  return (
    <StrategyContext.Provider value={{ strategy, setStrategy }}>
      {children}
    </StrategyContext.Provider>
  );
}

export function useStrategy() {
  return useContext(StrategyContext);
}
