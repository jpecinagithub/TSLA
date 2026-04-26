import { useEffect, useRef, useState } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
const WS_URL = import.meta.env.VITE_WS_URL ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`;
export function useLive() {
    const [data, setData] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    useEffect(() => {
        const ws = new ReconnectingWebSocket(WS_URL);
        wsRef.current = ws;
        ws.addEventListener("open", () => setConnected(true));
        ws.addEventListener("close", () => setConnected(false));
        ws.addEventListener("message", (e) => {
            try {
                setData(JSON.parse(e.data));
            }
            catch { /* ignore */ }
        });
        return () => ws.close();
    }, []);
    return { data, connected };
}
