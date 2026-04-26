import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function PageHeader({ title, subtitle, right }) {
    return (_jsxs("div", { className: "flex items-start justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-zinc-100", children: title }), subtitle && _jsx("p", { className: "text-sm text-zinc-500 mt-0.5", children: subtitle })] }), right && _jsx("div", { children: right })] }));
}
