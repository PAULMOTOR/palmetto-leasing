import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="relative mx-auto grid h-[4.75rem] max-w-[1280px] grid-cols-[1fr_auto_1fr] items-end px-4 pb-2.5 sm:h-[5.25rem] sm:px-6 sm:pb-3">
        <div />

        {/* Logo block — bottom edge is the alignment baseline for the tagline */}
        <Link
          to="/"
          className="flex flex-col items-center justify-end gap-1 justify-self-center transition-opacity duration-[var(--motion-quick)] hover:opacity-70"
        >
          <img
            src="/palmetto-logo.png"
            alt="Palmetto"
            className="h-9 w-auto object-contain sm:h-11"
            width={48}
            height={72}
          />
          <span className="text-[10px] font-medium tracking-[0.28em] text-fg uppercase sm:text-[11px]">
            Palmetto
          </span>
        </Link>

        {/* Tagline sits on the same baseline as the logo wordmark */}
        <div className="flex flex-col items-end justify-end gap-1.5 justify-self-end self-end pb-0.5">
          <Link
            to="/login"
            className="text-[11px] font-medium tracking-[0.18em] text-fg-muted uppercase transition-colors hover:text-fg"
          >
            Login
          </Link>
          <span className="hidden text-[9px] tracking-[0.12em] text-fg-subtle uppercase sm:block">
            A division of Paul Motor Co.
          </span>
        </div>
      </div>
    </header>
  );
}
