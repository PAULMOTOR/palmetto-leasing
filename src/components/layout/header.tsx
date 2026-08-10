import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="relative mx-auto grid h-[4.5rem] max-w-[1200px] grid-cols-3 items-center px-4 sm:px-6">
        <div />

        <Link
          to="/"
          className="flex flex-col items-center justify-center gap-0.5 justify-self-center transition-opacity duration-[var(--motion-quick)] hover:opacity-70"
        >
          <img
            src="/palmetto-mark.svg"
            alt=""
            className="h-7 w-auto sm:h-8"
            width={32}
            height={40}
          />
          <span className="text-[10px] font-medium tracking-[0.28em] text-fg uppercase sm:text-[11px]">
            Palmetto
          </span>
        </Link>

        <div className="flex flex-col items-end gap-0.5 justify-self-end">
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
