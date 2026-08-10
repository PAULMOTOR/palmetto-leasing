import type { ReactNode } from "react";
import { Footer } from "./footer";
import { Header } from "./header";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
