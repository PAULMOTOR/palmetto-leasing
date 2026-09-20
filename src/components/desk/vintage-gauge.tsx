import { DESK_BUCKETS, type DeskBucket } from "@/lib/desk/buckets";
import { cn } from "@/lib/utils";

/** Sweep from 8 o'clock to 4 o'clock. */
const START = -140;
const SWEEP = 280;

function needleDeg(value: number, max: number): number {
  const t = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return START + t * SWEEP;
}

export function VintageGauge({
  label,
  value,
  max = 8,
  onClick,
  active,
}: {
  label: string;
  value: number;
  max?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const gid = `dial-${label.replace(/[^a-z0-9]+/gi, "-")}`;
  const deg = needleDeg(value, Math.max(1, max));
  const ticks = 9;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border bg-surface px-3 py-4 text-center shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        active ? "border-fg" : "border-border",
      )}
    >
      <svg viewBox="0 0 120 108" className="h-[88px] w-[100px]" aria-hidden>
        <defs>
          <radialGradient id={gid} cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#f4efe4" />
            <stop offset="100%" stopColor="#d9d0be" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="58" r="48" fill="#2a2a2a" />
        <circle cx="60" cy="58" r="44" fill={`url(#${gid})`} stroke="#8a7d64" strokeWidth="1.5" />
        {Array.from({ length: ticks }, (_, i) => {
          const a = ((START + (i / (ticks - 1)) * SWEEP) * Math.PI) / 180;
          const x1 = 60 + Math.cos(a) * 34;
          const y1 = 58 + Math.sin(a) * 34;
          const x2 = 60 + Math.cos(a) * 40;
          const y2 = 58 + Math.sin(a) * 40;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#3a3428"
              strokeWidth={i === 0 || i === ticks - 1 ? 1.8 : 1}
            />
          );
        })}
        <g transform={`rotate(${deg} 60 58)`}>
          <polygon points="60,22 63,62 57,62" fill="#8b1e1e" />
        </g>
        <circle cx="60" cy="58" r="4.5" fill="#1a1a1a" />
        <circle cx="60" cy="58" r="2" fill="#c4a574" />
      </svg>
      <p className="font-display text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{label}</p>
    </button>
  );
}

export function DealProgressNeedle({ bucket }: { bucket: DeskBucket }) {
  const idx = Math.max(0, DESK_BUCKETS.indexOf(bucket));
  const deg = needleDeg(idx, DESK_BUCKETS.length - 1);
  return (
    <svg viewBox="0 0 72 56" className="h-10 w-14 shrink-0" aria-hidden>
      <circle cx="36" cy="38" r="28" fill="#2a2a2a" />
      <circle cx="36" cy="38" r="25" fill="#efe8d8" stroke="#8a7d64" strokeWidth="1" />
      <g transform={`rotate(${deg} 36 38)`}>
        <polygon points="36,16 38,40 34,40" fill="#8b1e1e" />
      </g>
      <circle cx="36" cy="38" r="3" fill="#1a1a1a" />
    </svg>
  );
}
