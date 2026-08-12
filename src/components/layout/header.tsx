import { Link } from "@tanstack/react-router";

/**
 * Logo is absolutely centered on the same max-width axis as the inventory grid
 * (max-w 1280 + equal horizontal padding), so the palm trunk lines up with
 * the vertical center of the middle car tile on desktop 3-col layout.
 * Small optical nudge: the mark’s trunk sits slightly left of the PNG center.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="relative mx-auto h-[4.75rem] max-w-[1280px] px-4 sm:h-[5.25rem] sm:px-6">
        {/* Dead-center of content column = center of middle inventory card */}
        <Link
          to="/"
          className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 transition-opacity duration-[var(--motion-quick)] hover:opacity-70 sm:bottom-3"
          aria-label="Palmetto home"
        >
          <img
            src="/palmetto-logo.png"
            alt=""
            className="h-9 w-auto object-contain object-center sm:h-11"
            /* trunk is ~3.5% left of image center — nudge so trunk hits true page center */
            style={{ transform: "translateX(2px)" }}
            width={48}
            height={72}
          />
          <span className="text-[10px] font-medium tracking-[0.28em] text-fg uppercase sm:text-[11px]">
            Palmetto
          </span>
        </Link>

        {/* Right cluster — does not affect logo centering */}
        <div className="absolute right-4 bottom-2.5 flex flex-col items-end gap-1.5 sm:right-6 sm:bottom-3">
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
