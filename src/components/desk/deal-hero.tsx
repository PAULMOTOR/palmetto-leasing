export function DealHero({
  url,
  alt,
  size = 48,
}: {
  url?: string;
  alt: string;
  size?: number;
}) {
  if (!url) {
    return (
      <span
        className="inline-block shrink-0 rounded-lg bg-surface-2"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      className="shrink-0 rounded-lg bg-white object-cover object-center"
      style={{ width: size, height: size }}
    />
  );
}