"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAuthAdminClient } from "@/lib/supabase/admin";

export async function updateApprovalAction(formData: FormData) {
  const adminContext = await requireAdmin();
  if (!adminContext) throw new Error("Administrator access required.");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "rejected", "pending"].includes(status)) throw new Error("Invalid approval request.");

  const admin = createAuthAdminClient();
  if (status === "approved") {
    const { error: authError } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
    if (authError) throw new Error(`Unable to confirm this account: ${authError.message}`);
  }
  const update = status === "approved"
    ? { status, approved_at: new Date().toISOString(), approved_by: adminContext.user.id }
    : { status, approved_at: null, approved_by: null };
  const { error } = await admin.from("app_profiles").update(update).eq("id", id).eq("role", "user");
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
