import { serverEnv } from "@/lib/env";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function supabase() {
  const jar = await cookies();
  const url = serverEnv().url,
    key = serverEnv().key;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components cannot write; proxy refreshes cookies. */
        }
      },
    },
  });
}
