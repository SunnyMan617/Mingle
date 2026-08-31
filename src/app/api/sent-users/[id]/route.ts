import { getApprovedAuthContext } from "@/lib/auth";
import { createAuthAdminClient } from "@/lib/supabase/admin";

function validSlackUserId(value: string) {
  return /^[a-zA-Z0-9._:-]{1,100}$/.test(value);
}

function missingSentUsersTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01" || /sent_users|schema cache/i.test(error.message || "");
}

export async function PATCH(request: Request, context: RouteContext<"/api/sent-users/[id]">) {
  const auth = await getApprovedAuthContext();
  if (!auth) return Response.json({ error: "Approved account required." }, { status: 401 });

  const { id } = await context.params;
  if (!validSlackUserId(id)) return Response.json({ error: "Invalid Slack user ID." }, { status: 400 });

  let body: { sent?: unknown };
  try {
    body = await request.json() as { sent?: unknown };
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400 });
  }
  if (typeof body.sent !== "boolean") return Response.json({ error: "The sent value must be a boolean." }, { status: 400 });

  const admin = createAuthAdminClient();
  if (body.sent) {
    const markedAt = new Date().toISOString();
    const { error } = await admin.from("sent_users").insert({
      slack_user_id: id,
      marked_by: auth.user.id,
      marked_at: markedAt,
    });

    if (error && error.code !== "23505") {
      console.error("Unable to mark Slack user as sent", { code: error.code });
      return Response.json(
        { error: missingSentUsersTable(error) ? "Sent tracking is not configured yet." : "Unable to update sent status." },
        { status: missingSentUsersTable(error) ? 503 : 500 },
      );
    }
    return Response.json({ sent: true, sentAt: error?.code === "23505" ? null : markedAt }, { headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await admin.from("sent_users").delete().eq("slack_user_id", id);
  if (error) {
    console.error("Unable to unmark Slack user as sent", { code: error.code });
    return Response.json(
      { error: missingSentUsersTable(error) ? "Sent tracking is not configured yet." : "Unable to update sent status." },
      { status: missingSentUsersTable(error) ? 503 : 500 },
    );
  }

  return Response.json({ sent: false, sentAt: null }, { headers: { "Cache-Control": "no-store" } });
}
