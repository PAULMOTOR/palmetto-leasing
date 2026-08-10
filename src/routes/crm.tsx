import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * CRM is a separate Vercel project — not hosted or databased here.
 */
export const Route = createFileRoute("/crm")({
  component: CrmRedirectPage,
  head: () => ({
    meta: [{ title: "CRM | Palmetto" }],
  }),
});

function CrmRedirectPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <img src="/palmetto-mark.svg" alt="" className="mx-auto h-9" />
      <h1 className="mt-6 text-lg font-medium">CRM lives elsewhere</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        Lease applications from this marketing site hand off to the Paul Motor CRM project via{" "}
        <code className="text-xs">CRM_HANDOFF_URL</code>. This site does not store CRM data or
        connect to Neon.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block text-xs tracking-wide text-fg-subtle uppercase hover:text-fg"
      >
        Back to inventory
      </Link>
    </div>
  );
}
