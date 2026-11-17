import { serverEnv, ServiceConfigurationError } from "@/lib/env";
import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  const url = serverEnv().url,
    key = serverEnv().secret;
  if (!url || !key) throw new ServiceConfigurationError();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
