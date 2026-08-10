import { createFileRoute, redirect } from "@tanstack/react-router";

/** Inventory is the home funnel — keep /inventory as a clean alias. */
export const Route = createFileRoute("/inventory")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
