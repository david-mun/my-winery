import { serverEnv } from "@/lib/env";
import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  const url = serverEnv().url,
    key = serverEnv().secret;
  if (!url || !key) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
