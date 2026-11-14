import "server-only";
import { adminClient } from "./supabase/admin";
export async function cleanupAssets(owner: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("asset_cleanup")
    .select("object_path")
    .eq("owner_id", owner)
    .limit(25);
  for (const item of data ?? []) {
    const { error } = await admin.storage
      .from("wine-assets")
      .remove([item.object_path]);
    if (!error)
      await admin
        .from("asset_cleanup")
        .delete()
        .eq("object_path", item.object_path)
        .eq("owner_id", owner);
  }
}
