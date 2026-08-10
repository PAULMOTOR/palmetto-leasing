import { createFileRoute } from "@tanstack/react-router";
import { listCatalogDealerSummaries, listCatalogVehicles } from "@/lib/leasing/catalog";
import { loadQuoteSettings } from "@/lib/leasing/quote-config";

/**
 * Marketing site has no inventory DB / crawler.
 * Endpoint kept so old cron configs don't 404 — returns static catalog stats.
 */
export const Route = createFileRoute("/api/cron/crawl")({
  server: {
    handlers: {
      GET: async () => {
        const list = listCatalogVehicles(loadQuoteSettings());
        return Response.json({
          status: "static",
          message: "Palmetto marketing site uses curated seed inventory (no Neon crawler).",
          dealersScanned: listCatalogDealerSummaries().length,
          listingsFound: list.length,
        });
      },
      POST: async () => {
        const list = listCatalogVehicles(loadQuoteSettings());
        return Response.json({
          status: "static",
          message: "Palmetto marketing site uses curated seed inventory (no Neon crawler).",
          dealersScanned: listCatalogDealerSummaries().length,
          listingsFound: list.length,
        });
      },
    },
  },
});
