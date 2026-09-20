import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DEALER_TOKEN_KEY = "palmetto_dealer_token";
export const DEALER_SLUG_KEY = "palmetto_dealer_slug";
export const DEALER_USER_KEY = "palmetto_dealer_user";

export type StoredDealerUser = { id: string; name: string; email: string; phone: string };

export function readDealerToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(DEALER_TOKEN_KEY);
}

export function readDealerUser(): StoredDealerUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEALER_USER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredDealerUser;
    if (!v?.id || !v.name) return null;
    return v;
  } catch {
    return null;
  }
}

export function DeskFrame({
  slug,
  dealerName,
  live,
  children,
}: {
  slug: string;
  dealerName?: string;
  live?: boolean;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<StoredDealerUser | null>(null);

  useEffect(() => {
    const t = readDealerToken();
    if (!t) {
      void nav({ to: "/login" });
      return;
    }
    setUser(readDealerUser());
    setReady(true);
  }, [nav]);

  function signOut() {
    sessionStorage.removeItem(DEALER_TOKEN_KEY);
    sessionStorage.removeItem(DEALER_SLUG_KEY);
    sessionStorage.removeItem(DEALER_USER_KEY);
    void nav({ to: "/login" });
  }

  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-fg-subtle" />
      </div>
    );
  }

  const links: { to: string; label: string; match: (p: string) => boolean }[] = [
    {
      to: `/desk/${slug}`,
      label: "Desk",
      match: (p) => p === `/desk/${slug}` || p === `/desk/${slug}/`,
    },
    {
      to: `/desk/${slug}/new`,
      label: "New deal",
      match: (p) => p.startsWith(`/desk/${slug}/new`),
    },
    {
      to: `/desk/${slug}/deals`,
      label: "Files",
      match: (p) => p.startsWith(`/desk/${slug}/deals`),
    },
    {
      to: `/desk/${slug}/people`,
      label: "Team",
      match: (p) => p.startsWith(`/desk/${slug}/people`),
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">
            Dealer Control Centre
          </p>
          <h1 className="mt-1 text-lg font-medium tracking-tight">{dealerName || slug}</h1>
          <p className="mt-1 text-xs text-fg-muted">
            {user
              ? `${user.name} · ${user.email}${user.phone ? ` · ${user.phone}` : ""}`
              : "Sign in with your email so credit can reach you on the file."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <nav className="mb-6 flex gap-1 rounded-full border border-border bg-surface p-1">
        {links.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "h-9 flex-1 rounded-full px-3 text-center text-sm font-medium leading-9 transition-colors",
                active ? "bg-fg text-primary-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}