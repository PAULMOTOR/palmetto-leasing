import { createFileRoute, redirect } from "@tanstack/react-router";

/** Single-page funnel — lease expands in-card on home. */
export const Route = createFileRoute("/lease/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
