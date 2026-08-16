// Quick catalog check: lists every pack this pipeline can build a video for,
// with its real script count and starting price, straight from the DB.
import "../lib/env.mjs";
import * as db from "../lib/db.mjs";

const packs = db.listPacks();
for (const p of packs) {
  const priceLabel = db.priceLabel(p.minPriceCents);
  console.log(`${p.id.padEnd(16)} ${p.packName.padEnd(28)} ${String(p.scriptCount).padStart(3)} scripts  from ${priceLabel}`);
}
console.log(`\n${packs.length} packs, ${db.totalScriptCount()} scripts total`);
