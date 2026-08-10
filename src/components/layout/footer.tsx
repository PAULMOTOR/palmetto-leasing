export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 px-4 text-center sm:px-6">
        <img
          src="/palmetto-logo.png"
          alt=""
          className="h-8 w-auto object-contain opacity-80"
          width={40}
          height={60}
        />
        <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">
          Palmetto · A division of Paul Motor Co.
        </p>
        <p className="text-[11px] text-fg-subtle">
          Quotes are estimates · Final terms subject to credit approval
        </p>
      </div>
    </footer>
  );
}
