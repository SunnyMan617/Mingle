import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getApprovedAuthContext } from "@/lib/auth";
import { cleanText, detailsFromProfileFields, detailsFromSections, mergeProfileDetails } from "@/lib/slack-profile";

type SlackSession = { origin: string; token: string; cookie: string };
type SlackField = {
  id: string;
  label?: string;
  field_name?: string;
  type?: string;
  ordering?: number;
  section_id?: string;
};
type SlackSection = { id: string; label?: string; order?: number };

let schemaPromise: Promise<{ fields: SlackField[]; sections: SlackSection[] }> | null = null;

async function readSession(): Promise<SlackSession> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), ".slack", "session.json"), "utf8")) as SlackSession;
  } catch {
    const origin = process.env.SLACK_ORIGIN?.trim();
    const token = process.env.SLACK_TOKEN?.trim();
    const cookie = process.env.SLACK_COOKIE?.trim();
    if (origin && token && cookie) return { origin: origin.replace(/\/$/, ""), token, cookie };
    throw new Error("Slack profile session is not configured");
  }
}

async function slackRequest(session: SlackSession, endpoint: string, fields: Record<string, string> = {}, query: Record<string, string> = {}) {
  const body = new FormData();
  body.append("token", session.token);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  const search = new URLSearchParams(query).toString();
  const url = `${session.origin}/api/${endpoint}${search ? `?${search}` : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      cookie: session.cookie,
      origin: "https://app.slack.com",
      "user-agent": "Mozilla/5.0 MingleProfileViewer/1.0",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Slack returned HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || `${endpoint} returned ok=false`);
  return data;
}

async function profileSchema(session: SlackSession) {
  if (!schemaPromise) {
    schemaPromise = slackRequest(session, "team.profile.get")
      .then((data) => ({ fields: data.profile?.fields || [], sections: data.profile?.sections || [] }))
      .catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

export async function GET(_request: Request, context: RouteContext<"/api/people/[id]">) {
  const auth = await getApprovedAuthContext();
  if (!auth) return Response.json({ error: "Approved account required." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[A-Z0-9]+$/i.test(id)) return Response.json({ error: "Invalid Slack user ID" }, { status: 400 });

  try {
    const session = await readSession();
    const [profileResponse, sectionsResponse, extrasResponse, schema] = await Promise.all([
      slackRequest(session, "users.profile.get", { user: id, include_labels: "true" }),
      slackRequest(session, "users.profile.getSections", {
        user: id,
        _x_reason: "profiles",
        _x_mode: "online",
        _x_sonic: "true",
        _x_app_name: "client",
      }, { _x_gantry: "true" }).catch(() => ({})),
      slackRequest(session, "users.profile.getExtras", { user: id, keys: "im_mpim_ids", _x_reason: "useProfileExtras", _x_mode: "online", _x_sonic: "true", _x_app_name: "client" }).catch(() => ({})),
      profileSchema(session),
    ]);

    const profile = profileResponse.profile || {};
    const fromSections = detailsFromSections(sectionsResponse);
    const fromFields = detailsFromProfileFields(profile.fields, schema);
    const details = mergeProfileDetails(fromSections.details, fromFields);

    return Response.json({
      profile: {
        title: cleanText(profile.title), phone: cleanText(profile.phone), skype: cleanText(profile.skype),
        realName: cleanText(profile.real_name), displayName: cleanText(profile.display_name),
        firstName: cleanText(profile.first_name), lastName: cleanText(profile.last_name), email: cleanText(profile.email),
        statusText: cleanText(profile.status_text), statusEmoji: cleanText(profile.status_emoji),
        statusExpiration: Number(profile.status_expiration || 0), imageOriginal: cleanText(profile.image_original),
      },
      details,
      sections: fromSections.sections,
      extras: {
        onboardingComplete: Boolean(extrasResponse.onboarding_complete),
        channelCount: Array.isArray(extrasResponse.channels) ? extrasResponse.channels.length : 0,
        sharedChannelCount: Array.isArray(extrasResponse.shared_channels) ? extrasResponse.shared_channels.length : 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Slack profile";
    const missingSession = /session\.json|ENOENT|session is not configured/i.test(message);
    return Response.json({ error: missingSession ? "Slack profile session is not configured" : message }, { status: missingSession ? 503 : 502 });
  }
}
