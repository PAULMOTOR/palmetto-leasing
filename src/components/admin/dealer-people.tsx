import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listDealerUsers, upsertDealerUser, type DealerUser } from "@/lib/desk/users";

export function DealerPeople({ token, dealerId }: { token: string; dealerId: string }) {
  const [people, setPeople] = useState<DealerUser[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const rows = await listDealerUsers({ data: { token, dealerId } });
      setPeople(rows);
    } catch {
      setPeople([]);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, dealerId, token]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertDealerUser({
        data: { token, dealerId, name, email, phone, pin },
      });
      toast.success("Person added");
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
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-fg-muted hover:text-fg"
      >
        People {people.length ? `(${people.length})` : ""} {open ? "–" : "+"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {people.length === 0 ? (
            <p className="text-xs text-fg-muted">No employees yet. Credit needs a named person on the file.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {people.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-3 text-fg-muted">
                  <span className="text-fg">{p.name}</span>
                  <span>{p.email}</span>
                  <span>{p.phone}</span>
                  {!p.active ? <span>inactive</span> : null}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={onAdd} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <Input placeholder="PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required />
            <Button type="submit" size="sm" disabled={saving}>
              Add person
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}