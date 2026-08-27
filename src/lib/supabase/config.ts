import "server-only";

export function authPublicConfig() {
  const url = process.env.SUPABASE_URL || process.env.AUTH_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.AUTH_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, key };
}

export function authAdminConfig() {
  const { url } = authPublicConfig();
  const key = process.env.SUPABASE_SECRET_KEY
    || process.env.AUTH_SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.");
  }
  return { url, key };
}
