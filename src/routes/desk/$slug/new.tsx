import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskCreditLink, deskExplodeVin, deskInventory, deskStartDeal } from "@/lib/desk/actions";

export const Route = createFileRoute("/desk/$slug/new")({
  component: NewDealPage,
  head: () => ({
    meta: [{ title: "New deal | Palmetto" }],
  }),
});

type StockCar = {
  id: string;
  title: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  price: number;
};

function NewDealPage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const [dealerName, setDealerName] = useState(slug);
  const [live, setLive] = useState(false);
  const [stock, setStock] = useState<StockCar[]>([]);
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [exploding, setExploding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [creditUrl, setCreditUrl] = useState<string | null>(null);
  const [sendingLink, setSendingLink] = useState(false);

  useEffect(() => {
    const token = readDealerToken();
    if (!token) return;
    void deskBoard({ data: { token, slug } })
      .then((b) => {
        setDealerName(b.dealerName || slug);
        setLive(b.live);
      })
      .catch(() => undefined);
    void deskInventory({ data: { token, slug } })
      .then((r) => setStock(r.vehicles))
      .catch(() => setStock([]));
  }, [slug]);

  function applyStock(id: string) {
    const v = stock.find((c) => c.id === id);
    if (!v) return;
    setVin(v.vin);
    setYear(v.year ? String(v.year) : "");
    setMake(v.make);
    setModel(v.model);
    setTrim(v.trim);
    if (v.price) setPrice(String(v.price));
  }

  async function onExplode() {
    const token = readDealerToken();
    if (!token) return;
    setExploding(true);
    try {
      const res = await deskExplodeVin({ data: { token, slug, vin } });
      if (!res.ok) {
        toast.message("Could not explode VIN", {
          description: "Type year, make and model.",
        });
        return;
      }
      if (res.year) setYear(String(res.year));
      if (res.make) setMake(res.make);
      if (res.model) setModel(res.model);
      if (res.trim) setTrim(res.trim);
      toast.success("VIN decoded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "VIN explode failed");
    } finally {
      setExploding(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = readDealerToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await deskStartDeal({
        data: {
          token,
          slug,
          name,
          email,
          phone: phone || undefined,
          vin: vin || undefined,
          year: year ? Number(year) : null,
          make: make || undefined,
          model: model || undefined,
          trim: trim || undefined,
          price: price ? Number(price) : undefined,
        },
      });
      if (!res.ok || !res.id) {
        toast.error(res.error || "CRM did not start the deal");
        return;
      }
      setCreatedId(res.id);
      toast.success("Deal started", { description: `CRM id ${res.id}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start deal");
    } finally {
      setSaving(false);
    }
  }

  async function onCreditLink() {
    const token = readDealerToken();
    if (!token || !createdId) return;
    setSendingLink(true);
    try {
      const res = await deskCreditLink({
        data: { token, slug, id: createdId, email: email || undefined },
      });
      if (!res.ok || !res.url) {
        toast.error(res.error || "Could not mint credit-app link");
        return;
      }
      setCreditUrl(res.url);
      await navigator.clipboard.writeText(res.url).catch(() => undefined);
      toast.success("Credit-app link copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credit link failed");
    } finally {
      setSendingLink(false);
    }
  }

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <h2 className="text-sm font-medium">Start a deal</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Palmetto posts this to the CRM Apply ingest and keeps the CRM deal id. Stages stay on
          the CRM.
        </p>

        {stock.length > 0 ? (
          <div className="mt-5">
            <Label htmlFor="stock">From your Palmetto inventory</Label>
            <select
              id="stock"
              className="mt-1 flex h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
              defaultValue=""
              onChange={(e) => applyStock(e.target.value)}
            >
              <option value="">Choose a listing…</option>
              {stock.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {v.vin ? ` · ${v.vin}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <form onSubmit={onCreate} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                className="mt-1 font-mono"
                maxLength={17}
                placeholder="17 characters"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void onExplode()} disabled={exploding || vin.length !== 17}>
              {exploding ? <Loader2 className="animate-spin" /> : null}
              Explode VIN
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Year" value={year} onChange={setYear} inputMode="numeric" />
            <Field label="Make" value={make} onChange={setMake} />
            <Field label="Model" value={model} onChange={setModel} />
            <Field label="Trim" value={trim} onChange={setTrim} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Client name" value={name} onChange={setName} required />
            <Field label="Email" value={email} onChange={setEmail} type="email" required />
            <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
          </div>

          <Field label="Price (optional)" value={price} onChange={setPrice} inputMode="decimal" />

          <Button type="submit" disabled={saving || Boolean(createdId)}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Create deal
          </Button>
        </form>

        {createdId ? (
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <p className="text-sm text-fg">
              CRM file <span className="font-mono">{createdId}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void onCreditLink()} disabled={sendingLink}>
                {sendingLink ? <Loader2 className="animate-spin" /> : null}
                Send credit link
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void nav({ to: "/desk/$slug/deals/$id", params: { slug, id: createdId } })
                }
              >
                Open file
              </Button>
            </div>
            {creditUrl ? (
              <p className="break-all text-xs text-fg-muted">
                Credit app:{" "}
                <a href={creditUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                  {creditUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </DeskFrame>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}
