import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
const toTime = (ts) => (new Date(ts).getTime() / 1000);
export default function CandleChart({ height = 320 }) {
    const ref = useRef(null);
    const chart = useRef(null);
    const candles = useRef(null);
    const ema9s = useRef(null);
    const ema21s = useRef(null);
    const vwaps = useRef(null);
    const { data: bars } = useQuery({
        queryKey: ["bars"],
        queryFn: () => api.get("/bars?limit=390"),
        refetchInterval: 60000,
    });
    useEffect(() => {
        if (!ref.current)
            return;
        const c = createChart(ref.current, {
            layout: { background: { type: ColorType.Solid, color: "#0a0d14" }, textColor: "#475569" },
            grid: { vertLines: { color: "#1a2030" }, horzLines: { color: "#1a2030" } },
            crosshair: { mode: CrosshairMode.Normal },
            timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#1a2030" },
            rightPriceScale: { borderColor: "#1a2030" },
            width: ref.current.clientWidth,
            height,
        });
        candles.current = c.addCandlestickSeries({
            upColor: "#10b981", downColor: "#f43f5e",
            borderUpColor: "#10b981", borderDownColor: "#f43f5e",
            wickUpColor: "#10b981", wickDownColor: "#f43f5e",
        });
        ema9s.current = c.addLineSeries({ color: "#3b82f6", lineWidth: 1, title: "EMA9" });
        ema21s.current = c.addLineSeries({ color: "#f59e0b", lineWidth: 1, title: "EMA21" });
        vwaps.current = c.addLineSeries({ color: "#8b5cf6", lineWidth: 1, lineStyle: 2, title: "VWAP" });
        chart.current = c;
        const ro = new ResizeObserver(() => {
            if (ref.current)
                c.resize(ref.current.clientWidth, height);
        });
        ro.observe(ref.current);
        return () => { ro.disconnect(); c.remove(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!bars || !candles.current)
            return;
        candles.current.setData(bars.map(b => ({ time: toTime(b.ts), open: b.open, high: b.high, low: b.low, close: b.close })));
        ema9s.current.setData(bars.filter(b => b.ema9 != null).map(b => ({ time: toTime(b.ts), value: b.ema9 })));
        ema21s.current.setData(bars.filter(b => b.ema21 != null).map(b => ({ time: toTime(b.ts), value: b.ema21 })));
        vwaps.current.setData(bars.filter(b => b.vwap != null).map(b => ({ time: toTime(b.ts), value: b.vwap })));
        chart.current.timeScale().fitContent();
    }, [bars]);
    return _jsx("div", { ref: ref, className: "w-full" });
}
