import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import { Shell } from "@/components/layout/shell";
import appCss from "../styles.css?url";

const APP_NAME = "Palmetto";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} | Paul Motor Leasing` },
      {
        name: "description",
        content:
          "Palmetto — premium Canadian auto leasing. A division of Paul Motor Co. Live lease quotes from partner dealer inventory.",
      },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#ececec" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <CreatedWithGrokBanner />
        <AuthProvider>
          <Shell>
            <Outlet />
          </Shell>
          <Toaster
            theme="light"
            position="bottom-right"
            toastOptions={{
              className: "border border-border bg-surface text-fg shadow-lg",
            }}
          />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
