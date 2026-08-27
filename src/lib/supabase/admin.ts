import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authAdminConfig } from "./config";

export function createAuthAdminClient() {
  const { url, key } = authAdminConfig();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
