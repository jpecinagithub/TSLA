import { jsx as _jsx } from "react/jsx-runtime";
const map = {
    buy: "pill-green",
    sell: "pill-red",
    hold: "pill-muted",
    executed: "pill-blue",
    blocked: "pill-red",
    skipped: "pill-muted",
    open: "pill-amber",
    closed: "pill-muted",
};
export default function Badge({ value }) {
    return _jsx("span", { className: map[value.toLowerCase()] ?? "pill-muted", children: value });
}
