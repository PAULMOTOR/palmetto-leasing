import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/how-it-works")({
  component: HowItWorksPage,
  head: () => ({
    meta: [{ title: "How it works | Palmetto" }],
  }),
});

const STEPS = [
  { n: "01", title: "Inventory", body: "Partner dealers sync stock into Palmetto." },
  { n: "02", title: "Lease", body: "36 months · 20% down · 50% residual — live math." },
  { n: "03", title: "CRM", body: "Every quote and dealer application lands as a lead." },
];

function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <h1 className="text-center text-lg font-medium tracking-tight">How it works</h1>
      <ol className="mt-10 space-y-4">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="rounded-[var(--radius-xl)] border border-border bg-surface px-5 py-4 shadow-[var(--shadow-card)]"
          >
            <p className="text-[11px] tracking-[0.16em] text-fg-subtle uppercase">{s.n}</p>
            <p className="mt-1 font-medium text-fg">{s.title}</p>
            <p className="mt-1 text-sm text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline">
          <Link to="/">Inventory</Link>
        </Button>
      </div>
    </div>
  );
}
