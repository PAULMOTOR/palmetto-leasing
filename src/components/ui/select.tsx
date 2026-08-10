import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full appearance-none rounded-full border border-border bg-surface px-4 pr-9 text-sm text-fg shadow-sm transition-[border-color,box-shadow] duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat",
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
