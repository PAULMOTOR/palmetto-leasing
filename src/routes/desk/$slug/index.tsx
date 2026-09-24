import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/desk/$slug/")({
  component: DeskHome,
});

function DeskHome() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  useEffect(() => {
    void nav({ to: "/desk/$slug/new", params: { slug }, replace: true });
  }, [nav, slug]);
  return null;
}
