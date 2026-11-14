import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/support/platform.sql","utf8"));
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  return db;
}
