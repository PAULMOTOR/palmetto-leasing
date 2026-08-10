import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display like "$ 279,000" (Palmetto card style). */
export function formatCad(cents: number): string {
  const n = new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 0,
  }).format(cents / 100);
  return `$ ${n}`;
}

export function formatCadExact(cents: number): string {
  const n = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `$ ${n}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-CA").format(n);
}
