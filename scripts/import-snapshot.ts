import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { snapshot } from "./snapshot";
config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2),
  arg = (key: string) => args[args.indexOf(key) + 1];
async function main() {
  const apply = args.includes("--apply"),
    verify = args.includes("--verify");
  if (Number(apply) + Number(verify) + Number(args.includes("--dry-run")) > 1)
    throw new Error("Select exactly one mode");
  const owner = args.includes("--owner") ? arg("--owner") : undefined;
  if ((apply || verify) && !owner?.match(/^[0-9a-f-]{36}$/i))
    throw new Error("--owner UUID is required");
  const plan = snapshot("data", owner);
  console.log("Source validation:", plan.report);
  if (!apply && !verify) {
    console.log(
      "DRY RUN: no database connection or writes. Images not provided; matching review required.",
    );
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing server environment");
  const project = new URL(url).hostname.split(".")[0];
  if (!args.includes("--project") || arg("--project") !== project)
    throw new Error("--project must match target project ref");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc(
    apply ? "apply_snapshot" : "verify_snapshot",
    apply
      ? { owner, payload: plan }
      : { owner, source_id: plan.source_file_id, checksum: plan.checksum },
  );
  if (error)
    throw new Error(
      `Database operation failed (${error.code}); no secret or raw response printed`,
    );
  console.log(apply ? "APPLY" : "VERIFY", data);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Import failed");
  process.exitCode = 1;
});
