import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deskBoard, deskListPeople, deskRemovePerson, deskUpsertPerson } from "@/lib/desk/actions";

export const Route = createFileRoute("/desk/$slug/people")({
  component: TeamPage,
  head: () => ({
    meta: [{ title: "Team | Palmetto" }],
  }),
});

function TeamPage() {
  const { slug } = Route.useParams();
  const [dealerName, setDealerName] = useState(slug);
  const [live, setLive] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string; email: string; phone: string; active: boolean }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = readDealerToken();
    if (!token) return;
    try {
      const [board, rows] = await Promise.all([
        deskBoard({ data: { token, slug } }).catch(() => null),
        deskListPeople({ data: { token, slug } }),
      ]);
      if (board) {
        setDealerName(board.dealerName || slug);
        setLive(board.live);
      }
      setPeople(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load team");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRemove(id: string, person: string) {
    const token = readDealerToken();
    if (!token) return;
    if (!window.confirm(`Delete ${person}? They will not be able to sign in.`)) return;
    try {
      await deskRemovePerson({ data: { token, slug, id } });
      toast.success("Person deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const token = readDealerToken();
    if (!token) return;
    setSaving(true);
    try {
      await deskUpsertPerson({ data: { token, slug, name, email, phone, pin } });
      toast.success("Person added", { description: `${name} can sign in with ${email}` });
      setName("");
      setEmail("");
      setPhone("");
      setPin("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <h2 className="text-sm font-medium">Team</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Sign-in stays here (email + PIN). Adding someone does not create a CRM login. When they
          save a quote, their name, email, and phone are stamped on that file so Palmetto credit
          can call them.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-fg-subtle" />
          </div>
        ) : people.length === 0 ? (
          <p className="mt-6 text-sm text-fg-muted">No people yet. Add the first person below.</p>
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <span className="font-medium text-fg">{p.name}</span>
                <span className="text-fg-muted">{p.email}</span>
                <span className="text-fg-muted">{p.phone}</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-destructive hover:underline"
                  onClick={() => void onRemove(p.id, p.name)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} className="mt-6 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <Input
            placeholder="PIN (their password)"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            minLength={4}
          />
          <Button type="submit" className="sm:col-span-2" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Add person
          </Button>
        </form>
      </section>
    </DeskFrame>
  );
}