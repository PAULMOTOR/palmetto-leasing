import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Shield, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clientLookup,
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

type Role = "client" | "dealer" | "admin" | null;

function LoginPage() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role>(null);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="relative rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-8 shadow-[var(--shadow-card)] sm:px-8">
        <Link
          to="/"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X className="size-4" />
        </Link>

        <img
          src="/palmetto-logo.png"
          alt="Palmetto"
          className="mx-auto h-14 w-auto object-contain"
          width={56}
          height={84}
        />
        <p className="mt-2 text-center text-[10px] tracking-[0.28em] text-fg uppercase">Palmetto</p>

        {!role ? (
          <>
            <h1 className="mt-6 text-center text-lg font-medium tracking-tight">Login</h1>
            <div className="mt-6 space-y-2">
              <RoleButton
                icon={<User className="size-4" />}
                title="Client"
                onClick={() => setRole("client")}
              />
              <RoleButton
                icon={<Building2 className="size-4" />}
                title="Dealer portal"
                onClick={() => setRole("dealer")}
              />
              <RoleButton
                icon={<Shield className="size-4" />}
                title="Admin"
                onClick={() => setRole("admin")}
              />
            </div>
          </>
        ) : role === "client" ? (
          <ClientLogin
            onBack={() => setRole(null)}
            onOk={(email) => {
              sessionStorage.setItem("palmetto_client_email", email);
              void nav({ to: "/portal/client" });
            }}
          />
        ) : role === "dealer" ? (
          <DealerLogin
            onBack={() => setRole(null)}
            onOk={(token) => {
              sessionStorage.setItem("palmetto_dealer_token", token);
              void nav({ to: "/portal/dealer" });
            }}
          />
        ) : (
          <AdminLogin
            onBack={() => setRole(null)}
            onOk={(token) => {
              sessionStorage.setItem("palmetto_admin_token", token);
              void nav({ to: "/admin" });
            }}
          />
        )}
      </div>
    </div>
  );
}

function RoleButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2/50 px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-[var(--motion-quick)] hover:border-border-strong hover:bg-surface-2 active:scale-[0.99]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-fg">
        {icon}
      </span>
      <span className="text-sm font-medium text-fg">{title}</span>
    </button>
  );
}

function ClientLogin({
  onBack,
  onOk,
}: {
  onBack: () => void;
  onOk: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await clientLookup({ data: { email } });
      if (res.applications.length === 0) {
        toast.message("No applications found", {
          description: "Apply from a vehicle card first, then return here.",
        });
      }
      onOk(email.trim().toLowerCase());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-fg-muted hover:text-fg">
        ← All options
      </button>
      <h2 className="text-base font-medium">Client</h2>
      <div>
        <Label htmlFor="client-email">Email</Label>
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@email.com"
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Looking up…" : "Continue"}
      </Button>
    </form>
  );
}

function DealerLogin({
  onBack,
  onOk,
}: {
  onBack: () => void;
  onOk: (token: string) => void;
}) {
  const [dealers, setDealers] = useState<{ id: string; name: string; city: string }[]>([]);
  const [dealerId, setDealerId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listActiveDealersForLogin().then((rows) => {
      setDealers(rows);
      if (rows[0]) setDealerId(rows[0].id);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await dealerPortalLogin({ data: { dealerId, pin } });
      if (!res.ok) {
        toast.error("Invalid PIN");
        return;
      }
      onOk(res.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-fg-muted hover:text-fg">
        ← All options
      </button>
      <h2 className="text-base font-medium">Dealer portal</h2>
      <div>
        <Label htmlFor="dealer">Dealership</Label>
        <select
          id="dealer"
          value={dealerId}
          onChange={(e) => setDealerId(e.target.value)}
          className="mt-1 flex h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
          required
        >
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="dealer-pin">PIN</Label>
        <Input
          id="dealer-pin"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !dealerId}>
        {loading ? "Signing in…" : "Enter portal"}
      </Button>
    </form>
  );
}

function AdminLogin({
  onBack,
  onOk,
}: {
  onBack: () => void;
  onOk: (token: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await verifyAdminPin({ data: { pin } });
      if (!res.ok) {
        toast.error("Invalid PIN");
        return;
      }
      onOk(res.token);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-fg-muted hover:text-fg">
        ← All options
      </button>
      <h2 className="text-base font-medium">Admin</h2>
      <div>
        <Label htmlFor="admin-pin">PIN</Label>
        <Input
          id="admin-pin"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Unlocking…" : "Unlock"}
      </Button>
    </form>
  );
}
