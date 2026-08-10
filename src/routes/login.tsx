import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Shield, User } from "lucide-react";
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
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-8 shadow-[var(--shadow-card)] sm:px-8">
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
            <p className="mt-2 text-center text-sm text-fg-muted">Choose how you access Palmetto</p>
            <div className="mt-6 space-y-2.5">
              <RoleButton
                icon={<User className="size-4" />}
                title="Client"
                desc="Application status, documents, contract & buyout"
                onClick={() => setRole("client")}
              />
              <RoleButton
                icon={<Building2 className="size-4" />}
                title="Dealer portal"
                desc="Referral fees & quote payout settings"
                onClick={() => setRole("dealer")}
              />
              <RoleButton
                icon={<Shield className="size-4" />}
                title="Admin"
                desc="Inventory pool & default quote settings"
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

        <Link
          to="/"
          className="mt-6 block text-center text-[11px] tracking-wide text-fg-subtle uppercase transition-colors hover:text-fg"
        >
          Inventory
        </Link>
      </div>
    </div>
  );
}

function RoleButton({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2/50 px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-[var(--motion-quick)] hover:border-border-strong hover:bg-surface-2 active:scale-[0.99]"
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-fg">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{desc}</span>
      </span>
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
      <h2 className="text-base font-medium">Client access</h2>
      <p className="text-xs text-fg-muted">Enter the email used on your lease application.</p>
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
        {loading ? "Looking up…" : "View my applications"}
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
      <p className="text-xs text-fg-muted">Default PIN for demo: dealer</p>
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
        <Label htmlFor="dealer-pin">Portal PIN</Label>
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
      <p className="text-xs text-fg-muted">Default PIN: palmetto</p>
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
        {loading ? "Unlocking…" : "Unlock admin"}
      </Button>
    </form>
  );
}
