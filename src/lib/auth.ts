import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "user";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type AppProfile = {
  id: string;
  email: string;
  username: string;
  role: AppRole;
  status: ApprovalStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
};

export async function getAuthContext(): Promise<{ user: User | null; profile: AppProfile | null }> {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data } = await supabase
    .from("app_profiles")
    .select("id,email,username,role,status,created_at,approved_at,approved_by")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: (data as AppProfile | null) ?? null };
}

export async function getApprovedAuthContext() {
  const { user, profile } = await getAuthContext();
  if (!user || !profile || profile.status !== "approved") return null;
  return { user, profile };
}

export async function requireAdmin() {
  const context = await getApprovedAuthContext();
  if (!context || context.profile.role !== "admin") return null;
  return context;
}
