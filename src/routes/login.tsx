import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  dealerPortalLogin,
  listActiveDealersForLogin,
  verifyAdminPin,
} from "@/lib/leasing/settings";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Login | Palmetto" }],
  }),
});

type Role = "dealer" | "admin";

function LoginPage() {
  const [role, setRole] = useState<Role>("dealer");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="relative rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-8 shadow-[var(--shadow-card)] sm:px-8">
        <Link
          to="/"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <span className="text-lg leading-none">×</span>
        </Link>

        <img
          src="/palmetto-logo.png"
          alt="Palmetto"
          className="mx-auto h-14 w-auto object-contain"
          width={56}
          height={84}
        />
        <p className="mt-2 text-center text-[10px] tracking-[0.28em] text-fg uppercase">Palmetto</p>
        <h1 className="mt-6 text-center text-lg font-medium tracking-tight">Login</h1>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-border p-1">
          <button
            type="button"
            onClick={() => setRole("dealer")}
            className={cn(
              "h-9 rounded-full text-sm font-medium transition-colors",
              role === "dealer" ? "bg-fg text-primary-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            Dealer
          </button>
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={cn(
              "h-9 rounded-full text-sm font-medium transition-colors",
              role === "admin" ? "bg-fg text-primary-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            Admin
          </button>
        </div>

        {role === "dealer" ? <DealerLoginForm /> : <AdminLoginForm />}
      </div>
    </div>
  );
}

function resolveDealerId(
  raw: string,
  dealers: { id: string; name: string }[],
): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const exactId = dealers.find((d) => d.id.toLowerCase() === t);
  if (exactId) return exactId.id;
  const exactName = dealers.find((d) => d.name.toLowerCase() === t);
  if (exactName) return exactName.id;
  const fuzzy = dealers.filter(
    (d) => d.name.toLowerCase().includes(t) || d.id.toLowerCase().includes(t),
  );
  return fuzzy.length === 1 ? fuzzy[0]!.id : null;
}

function DealerLoginForm() {
  const nav = useNavigate();
  const [dealers, setDealers] = useState<{ id: string; name: string; city: string }[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listActiveDealersForLogin().then(setDealers).catch(() => setDealers([]));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dealerId = resolveDealerId(username, dealers);
    if (!dealerId) {
      toast.error("Unknown dealership");
      return;
    }
    setLoading(true);
    try {
      const res = await dealerPortalLogin({ data: { dealerId, pin: password } });
      if (!res.ok) {
        toast.error("Invalid password");
        return;
      }
      sessionStorage.setItem("palmetto_dealer_token", res.token);
      void nav({ to: "/portal/dealer" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form method="post" action="/login" onSubmit={onSubmit} className="mt-6 space-y-3" autoComplete="on">
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          list="palmetto-dealer-usernames"
          required
          placeholder="Your dealership"
          className="mt-1"
        />
        <datalist id="palmetto-dealer-usernames">
          {dealers.map((d) => (
            <option key={d.id} value={d.name} />
          ))}
        </datalist>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Enter dealer portal"}
      </Button>
    </form>
  );
}

function AdminLoginForm() {
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await verifyAdminPin({ data: { pin: password } });
      if (!res.ok) {
        toast.error("Invalid password");
        return;
      }
      sessionStorage.setItem("palmetto_admin_token", res.token);
      void nav({ to: "/admin" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form method="post" action="/login" onSubmit={onSubmit} className="mt-6 space-y-3" autoComplete="on">
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Unlocking…" : "Unlock admin"}
      </Button>
    </form>
  );
}
