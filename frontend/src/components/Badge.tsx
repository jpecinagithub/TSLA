type V = "buy"|"sell"|"hold"|"executed"|"blocked"|"skipped"|"open"|"closed";

const map: Record<V, string> = {
  buy:      "pill-green",
  sell:     "pill-red",
  hold:     "pill-muted",
  executed: "pill-blue",
  blocked:  "pill-red",
  skipped:  "pill-muted",
  open:     "pill-amber",
  closed:   "pill-muted",
};

export default function Badge({ value }: { value: string }) {
  return <span className={map[(value.toLowerCase() as V)] ?? "pill-muted"}>{value}</span>;
}
