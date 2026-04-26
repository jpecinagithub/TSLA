import { useEffect, useRef, useState } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";

export interface LiveState {
  ts: string;
  close: number;
  ema9: number | null;
  ema21: number | null;
  rsi14: number | null;
  vwap: number | null;
  vol_ratio: number | null;
  capital: number;
  daily_pnl: number;
  position: { entry_price: number; shares: number } | null;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`;

export function useLive() {
  const [data, setData] = useState<LiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  useEffect(() => {
    const ws = new ReconnectingWebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open",    () => setConnected(true));
    ws.addEventListener("close",   () => setConnected(false));
    ws.addEventListener("message", (e) => {
      try { setData(JSON.parse(e.data)); } catch { /* ignore */ }
    });

    return () => ws.close();
  }, []);

  return { data, connected };
}
