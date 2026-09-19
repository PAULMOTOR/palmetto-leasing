import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/$slug")({
  component: DeskLayout,
  head: () => ({
    meta: [{ title: "Control Centre | Palmetto" }],
  }),
});

function DeskLayout() {
  return <Outlet />;
}
