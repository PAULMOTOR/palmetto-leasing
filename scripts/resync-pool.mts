import { getSql } from "../src/lib/db.ts";
import { DEALERS } from "../src/lib/leasing/seed.ts";
import { runInventoryCrawl } from "../src/lib/crawler/run.ts";

async function main() {
  const sql = await getSql();
  for (const d of DEALERS) {
    await sql`update dealerships set active = ${d.active}, inventory_url = ${d.inventory_url}, website_url = ${d.website_url} where id = ${d.id}`;
  }
  const r = await runInventoryCrawl({ forceIncludeAll: true });
  console.log(JSON.stringify(r));
  const counts = await sql`select d.id, d.active::text as active, (select count(*)::int from vehicles v where v.dealership_id = d.id and v.status = 'active') as n from dealerships d order by d.active desc, d.id`;
  console.log(JSON.stringify(counts, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
