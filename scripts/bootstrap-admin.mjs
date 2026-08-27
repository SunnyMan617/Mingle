import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.AUTH_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY
  || process.env.AUTH_SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!url || !secret || !email || !username || !password) {
  throw new Error("Set SUPABASE_URL, a server-only Supabase key, ADMIN_EMAIL, ADMIN_USERNAME, and ADMIN_PASSWORD.");
}
if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) throw new Error("ADMIN_USERNAME must be a valid 3–30 character username.");
if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { error: schemaError } = await supabase.from("app_profiles").select("id").limit(1);
if (schemaError) {
  const missingTable = schemaError.code === "PGRST205" || /app_profiles|schema cache/i.test(schemaError.message);
  throw new Error(missingTable
    ? "Authentication schema is missing. Run supabase/auth-setup.sql in the Supabase SQL Editor, then rerun this command."
    : `Unable to verify the authentication schema: ${schemaError.message}`);
}

let user;
let result = "updated";
for (let page = 1; page <= 20 && !user; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (data.users.length < 1000) break;
}

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (error) throw new Error(`Unable to create the admin user: ${error.message}`);
  user = data.user;
  result = "created";
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { ...user.user_metadata, username } });
  if (error) throw new Error(`Unable to update the admin user: ${error.message}`);
  user = data.user;
}

const { error: profileError } = await supabase.from("app_profiles").upsert({
  id: user.id,
  email,
  username,
  role: "admin",
  status: "approved",
  approved_at: new Date().toISOString(),
  approved_by: user.id,
}, { onConflict: "id" });
if (profileError) throw profileError;

console.log(`Admin account ${result}: ${email}`);
console.log(`Username: ${username}`);
console.log("Role: admin; approval status: approved");
