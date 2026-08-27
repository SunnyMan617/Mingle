import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing Supabase admin environment variables");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profiles, error: profilesError } = await supabase
  .from("app_profiles")
  .select("id, username")
  .eq("role", "user")
  .eq("status", "approved");

if (profilesError) throw profilesError;

const confirmedUsers = [];

for (const profile of profiles || []) {
  const { data, error: userError } = await supabase.auth.admin.getUserById(profile.id);
  if (userError) throw userError;

  if (!data.user.email_confirmed_at) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
      email_confirm: true,
    });
    if (updateError) throw updateError;
    confirmedUsers.push(profile.username);
  }
}

console.log(JSON.stringify({
  approvedUsers: profiles?.length || 0,
  confirmedNow: confirmedUsers.length,
  confirmedUsers,
}));
