// Operator-only. Never print a password, a session, or a recovery link.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { z } from "zod";
import { snapshot } from "./snapshot";
config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const arg = (key: string) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const die = (message: string): never => {
  throw new Error(message);
};
async function main() {
  if (!args.includes("--apply")) {
    console.log("No changes. Requires --apply --email ADDRESS --project REF.");
    return;
  }
  const email = z.email().parse(arg("--email")).toLowerCase();
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (
    !/^[a-z0-9]{20}$/.test(arg("--project") ?? "") ||
    url.origin !== "https://" + arg("--project") + ".supabase.co"
  )
    die("Wrong project.");
  const app = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
  if (
    !["127.0.0.1", "localhost"].includes(app.hostname) ||
    !["http:", "https:"].includes(app.protocol)
  )
    die("Use a loopback app URL for the local first-login file.");
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const admin = createClient(
    url.origin,
    process.env.SUPABASE_SECRET_KEY!,
    options,
  );
  const anon = createClient(
    url.origin,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
  const dir = ".local-private",
    state = dir + "/commission-" + arg("--project") + ".json";
  await mkdir(dir, { mode: 0o700, recursive: true });
  const roles = await admin
    .from("app_user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (roles.error) die("Cannot inspect admin role.");
  let recorded: { owner: string; email: string } | null = null;
  try {
    recorded = JSON.parse(await readFile(state, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      die("Cannot read local operator state.");
  }
  let owner: string;
  if (recorded) {
    owner = z.uuid().parse(recorded.owner);
    const existing = await admin.auth.admin.getUserById(owner);
    if (
      existing.error ||
      existing.data.user?.email?.toLowerCase() !== email ||
      recorded.email !== email ||
      !existing.data.user?.email_confirmed_at
    )
      die("Recorded account mismatch.");
  } else {
    if (roles.data?.length)
      die(
        "An administrator already exists; use the existing owner's bootstrap/import workflow.",
      );
    if (args.includes("--renew-link"))
      die("Renewal requires an existing recorded owner.");
    const password = randomBytes(36).toString("base64url") + "aA1!";
    const c = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (c.error || !c.data.user?.email_confirmed_at)
      die(
        "Account creation did not complete. No pre-existing account will be promoted.",
      );
    owner = c.data.user!.id;
    await writeFile(state, JSON.stringify({ owner, email }), {
      flag: "wx",
      mode: 0o600,
    });
    const login = await anon.auth.signInWithPassword({ email, password });
    if (login.error || login.data.user.id !== owner)
      die("Live owner sign-in failed.");
    await anon.auth.signOut({ scope: "local" });
    console.log(
      "Verified newly provisioned owner's password sign-in; random provisioning password discarded.",
    );
  }
  if (args.includes("--renew-link")) {
    const profile = await admin
      .from("profiles")
      .select("status")
      .eq("id", owner)
      .single();
    if (
      profile.error ||
      profile.data?.status !== "active" ||
      !roles.data?.some((role) => role.user_id === owner)
    )
      die("Renewal requires the active recorded administrator.");
  } else if (!roles.data?.length) {
    const { error } = await admin.rpc("bootstrap_admin", { target: owner });
    if (error) die("Admin bootstrap failed: " + error.code);
  } else if (roles.data.length !== 1 || roles.data[0].user_id !== owner)
    die("Administrator does not match the recorded owner.");
  console.log("Owner account and admin role verified.");
  async function writeFirstLogin() {
    const path = dir + "/first-login.txt";
    // Only generate on first handoff or by explicit operator request; never refresh an active link on a retry.
    try {
      await access(path);
      if (!args.includes("--renew-link")) return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const link = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (
      link.error ||
      link.data.user?.id !== owner ||
      !link.data.properties?.hashed_token
    )
      die("First-login link creation failed.");
    const callback = new URL("/auth/callback", app);
    callback.searchParams.set("type", "recovery");
    callback.searchParams.set("token_hash", link.data.properties!.hashed_token);
    await writeFile(
      path,
      "본인만 사용하세요. 로컬 앱 실행 후 아래 주소를 브라우저에 붙여넣고 새 비밀번호를 정하세요. 일회용이며 만료됩니다. 사용 후 이 파일을 지워도 됩니다.\n\n" +
        callback.href +
        "\n",
      { mode: 0o600 },
    );
    await chmod(path, 0o600);
    console.log(
      "One-time setup link written to .local-private/first-login.txt. No email sent.",
    );
  }
  // Renewal must also work after the owner has edited their collection.
  if (args.includes("--renew-link")) {
    await writeFirstLogin();
    return;
  }
  const plan = snapshot("data", owner);
  for (const name of ["apply_snapshot", "verify_snapshot", "apply_snapshot"]) {
    const { data, error } = await admin.rpc(
      name,
      name === "apply_snapshot"
        ? { owner, payload: plan }
        : { owner, source_id: plan.source_file_id, checksum: plan.checksum },
    );
    if (error) die("Snapshot RPC failed: " + name + " / " + error.code);
    if (name === "verify_snapshot" && data?.verified !== true)
      die("Unverified import");
  }
  // Verify the stored rows independently of the batch report.
  const read = async (table: string, columns: string) => {
    const r = await admin.from(table).select(columns).eq("owner_id", owner);
    if (r.error) die("Read-back failed: " + table);
    return r.data as unknown as Record<string, string | number | null>[];
  };
  const [wines, receipts, lines, bottles, ratings, notes, media] =
    await Promise.all([
      read("wines", "id"),
      read("purchase_receipts", "id,paid_amount,purchased_on,discount_amount"),
      read("receipt_lines", "id,receipt_id,line_kind,line_amount"),
      read(
        "receipt_line_wines",
        "receipt_line_id,bottle_quantity,allocated_amount,vintage_label",
      ),
      read("external_ratings", "id,checked_on,verification_status"),
      read("tasting_notes", "id,tasted_on"),
      read("media_assets", "id"),
    ]);
  const sep = receipts.find((r) => r.purchased_on === "2026-09-13"),
    oct = receipts.find((r) => r.purchased_on === "2026-10-10");
  const bundle = lines.filter(
    (l) => l.receipt_id === sep?.id && l.line_kind === "bundle",
  );
  const discount = lines.filter(
    (l) => l.receipt_id === oct?.id && l.line_kind === "discount",
  );
  const linked = bottles.filter((b) => b.receipt_line_id === bundle[0]?.id);
  if (
    wines.length !== 10 ||
    receipts.length !== 2 ||
    Number(sep?.paid_amount) !== 143500 ||
    Number(oct?.paid_amount) !== 150400 ||
    Number(oct?.discount_amount) !== 18000 ||
    bundle.length !== 1 ||
    Number(bundle[0].line_amount) !== 39900 ||
    linked.length !== 2 ||
    linked.some((b) => b.allocated_amount !== null) ||
    discount.length !== 1 ||
    Number(discount[0].line_amount) !== -18000 ||
    bottles.reduce((s, b) => s + Number(b.bottle_quantity), 0) !== 12 ||
    ratings.length !== 11 ||
    notes.length !== 5 ||
    notes.some((n) => n.tasted_on !== null) ||
    media.length !== 0
  )
    die("Independent reconciliation failed; inspect before changing any data.");
  console.log(
    "Stored data verified: 10 wines / 12 bottles / 2 receipts / KRW 293900 / 11 ratings / 5 reviews / 0 images. Repeat import verified.",
  );
  await writeFirstLogin();
}
main().catch((e) => {
  console.error(
    e instanceof z.ZodError
      ? "Invalid operator input"
      : e instanceof Error
        ? e.message
        : "Provisioning failed",
  );
  process.exitCode = 1;
});
