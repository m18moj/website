// Preview the AI-generated ad copy for a pack/platform (or the website
// promo) without running the rest of the pipeline — useful for iterating on
// prompts in pipeline/lib/copywriter.mjs.
//   node pipeline/scripts/gen-copy.mjs --pack minecraft --platform tiktok
//   node pipeline/scripts/gen-copy.mjs --website
import "../lib/env.mjs";
import * as db from "../lib/db.mjs";
import { generatePackCopy, generateWebsiteCopy } from "../lib/copywriter.mjs";

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (args.includes("--website")) {
    const packs = db.listPacks();
    const totalScripts = db.totalScriptCount();
    const copy = await generateWebsiteCopy({ packs, totalScripts });
    console.log(JSON.stringify(copy, null, 2));
    return;
  }

  const packId = get("--pack");
  const platformId = get("--platform") || "tiktok";
  if (!packId) {
    console.error("Usage: node pipeline/scripts/gen-copy.mjs --pack <id> --platform <tiktok|shorts|promo> | --website");
    process.exit(1);
  }
  const pack = db.getPack(packId);
  pack.priceLabel = db.priceLabel(pack.minPriceCents);
  const scripts = db.listScripts(packId, 6);
  const copy = await generatePackCopy({ platform: platformId, pack, scripts });
  console.log(JSON.stringify(copy, null, 2));
}

main().catch((err) => {
  console.error("[gen-copy] FAILED:", err.message);
  process.exitCode = 1;
});
