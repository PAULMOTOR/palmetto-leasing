import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

/**
 * Logo is absolutely centered on the same max-width axis as the inventory grid
 * (max-w 1280 + equal horizontal padding), so the palm trunk lines up with
 * the vertical center of the middle car tile on desktop 3-col layout.
 * Small optical nudge: the mark’s trunk sits slightly left of the PNG center.
 */
export function Header() {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="relative mx-auto h-[4.75rem] max-w-[1280px] px-4 sm:h-[5.25rem] sm:px-6">
        {/* Dead-center of content column = center of middle inventory card */}
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 transition-opacity duration-[var(--motion-quick)] hover:opacity-70 sm:bottom-3"
          aria-label="About Palmetto"
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
        </button>

        {/* Right cluster — does not affect logo centering */}
        <div className="absolute right-4 bottom-2.5 flex flex-col items-end gap-1.5 sm:right-6 sm:bottom-3">
          <Link
            to="/login"
            className="text-[11px] font-medium tracking-[0.18em] text-fg-muted uppercase transition-colors hover:text-fg"
          >
            Login
          </Link>
          <a
            href="https://www.paulmotorleasing.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-[9px] tracking-[0.12em] text-fg-subtle uppercase transition-colors hover:text-fg sm:block"
          >
            A division of Paul Motor Co.
          </a>
        </div>
      </div>

      {aboutOpen && <AboutPalmettoDialog onClose={() => setAboutOpen(false)} />}
    </header>
  );
}

function AboutPalmettoDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-palmetto-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-7 shadow-[var(--shadow-card-hover)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="mb-5 flex flex-col items-center gap-2">
          <img
            src="/palmetto-logo.png"
            alt=""
            className="h-12 w-auto object-contain"
            width={48}
            height={72}
          />
          <p className="text-[11px] font-medium tracking-[0.28em] text-fg uppercase">Palmetto</p>
        </div>

        <h2
          id="about-palmetto-title"
          className="text-center text-base font-medium tracking-tight text-fg sm:text-lg"
        >
          What is Palmetto?
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-fg-muted">
          Palmetto is a portal for{" "}
          <span className="font-medium text-fg">trusted dealer partners</span> to list their
          vehicles and deliver lease quotes and applications — with{" "}
          <span className="font-medium text-fg">5-minute approval</span>.
        </p>
        <p className="mt-3 text-center text-sm leading-relaxed text-fg-muted">
          Browse inventory, run a live lease estimate, and apply without leaving the site.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-fg text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
        >
          Explore inventory
        </button>
      </div>
    </div>
  );
}
