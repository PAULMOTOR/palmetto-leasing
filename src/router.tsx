import { createRouter, Link } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-xs tracking-[0.14em] text-fg-subtle uppercase">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        That route is not part of the Paul Motor Leasing site.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-primary px-5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
      >
        Back home
      </Link>
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFound,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
