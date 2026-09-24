import { DESK_STAGES, DESK_STAGE_META, deskStage } from "@/lib/desk/stages";

export function StagePill({ bucket }: { bucket: string }) {
  const stage = deskStage(bucket);
  if (stage === "lost") {
    return (
      <span className="inline-flex h-7 items-center rounded-full bg-neutral-200 px-3 text-[11px] font-medium text-neutral-500">
        Lost
      </span>
    );
  }
  const at = DESK_STAGES.indexOf(stage);
  return (
    <div
      className="flex h-7 w-full max-w-[320px] overflow-hidden rounded-full border border-border bg-canvas"
      role="img"
      aria-label={DESK_STAGE_META[stage].label}
    >
      {DESK_STAGES.map((id, i) => {
        const on = i <= at;
        const meta = DESK_STAGE_META[id];
        return (
          <span
            key={id}
            className="flex flex-1 items-center justify-center px-1 text-[10px] font-medium tracking-wide"
            style={{
              background: on ? meta.color : "transparent",
              color: on ? "#fff" : "#8a847c",
            }}
          >
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
