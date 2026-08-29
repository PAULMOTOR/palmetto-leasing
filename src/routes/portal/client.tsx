import { createFileRoute, redirect } from "@tanstack/react-router";

/** Client area retired — Login is dealer portal and admin only. */
export const Route = createFileRoute("/portal/client")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
