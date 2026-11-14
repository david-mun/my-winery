import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
async function main() {
  if (!args.includes("--apply")) {
    console.log(
      "DRY RUN. Requires --apply --owner UUID --project PROJECT_REF after explicit environment approval. Creates no Auth user or email.",
    );
    return;
  }
  const owner = z.uuid().parse(args[args.indexOf("--owner") + 1]);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing configuration");
  if (
    !args.includes("--project") ||
    args[args.indexOf("--project") + 1] !== new URL(url).hostname.split(".")[0]
  )
    throw new Error("Target project mismatch");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.admin.getUserById(owner);
  if (error || !data.user?.email_confirmed_at)
    throw new Error("An existing confirmed Auth user is required");
  const result = await db.rpc("bootstrap_admin", { target: owner });
  if (result.error) throw new Error("Bootstrap failed: " + result.error.code);
  console.log("First admin initialized. No credentials printed.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Bootstrap failed");
  process.exitCode = 1;
});
