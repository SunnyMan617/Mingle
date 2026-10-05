"use server";

import { redirect } from "next/navigation";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { createAuthClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | null;

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeNextPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function signInAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = value(formData, "identifier").toLowerCase();
  const password = value(formData, "password");
  let email = identifier;

  if (!identifier || !password) return { error: "Enter your email or username and password." };

  if (!identifier.includes("@")) {
    const admin = createAuthAdminClient();
    const { data } = await admin.from("app_profiles").select("email").ilike("username", identifier).maybeSingle();
    if (!data?.email) return { error: "The email/username or password is incorrect." };
    email = data.email;
  }

  const supabase = await createAuthClient();
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const unconfirmed = error?.code === "email_not_confirmed" || /email not confirmed/i.test(error?.message || "");
  if (unconfirmed) {
    const admin = createAuthAdminClient();
    const { data: profile } = await admin.from("app_profiles").select("id,status").ilike("email", email).maybeSingle();
    if (profile?.id) {
      await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    }
  }
  if (error || !data.user) {
    return { error: "The email/username or password is incorrect." };
  }

  const admin = createAuthAdminClient();
  const { data: profile } = await admin.from("app_profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "approved") redirect("/auth/pending");
  redirect(safeNextPath(value(formData, "next")));
}

export async function signUpAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = value(formData, "email").toLowerCase();
  const username = value(formData, "username").toLowerCase();
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");

  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return { error: "Username must be 3–30 characters using letters, numbers, dots, dashes, or underscores." };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must contain at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const admin = createAuthAdminClient();
  const { data: existing } = await admin.from("app_profiles").select("id").ilike("username", username).maybeSingle();
  if (existing) return { error: "That username is already in use." };

  const { data: existingEmail } = await admin.from("app_profiles").select("id").ilike("email", email).maybeSingle();
  if (existingEmail) return { error: "An account already exists for this email." };

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) {
    const duplicate = /already|registered|exists/i.test(error?.message || "");
    return { error: duplicate ? "An account already exists for this email." : error?.message || "Unable to create the access request." };
  }

  const { error: profileError } = await admin.from("app_profiles").insert({
    id: created.user.id,
    email,
    username,
    role: "user",
    status: "pending",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: /username/i.test(profileError.message) ? "That username is already in use." : "Unable to create the access request. Please try again." };
  }
  redirect("/auth/pending?created=1");
}

export async function signOutAction() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}
