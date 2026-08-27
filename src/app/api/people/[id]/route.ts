import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
  return JSON.parse(await readFile(join(process.cwd(), ".slack", "session.json"), "utf8")) as SlackSession;
}

async function slackRequest(session: SlackSession, endpoint: string, fields: Record<string, string> = {}) {
  const body = new FormData();
  body.append("token", session.token);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const response = await fetch(`${session.origin}/api/${endpoint}`, {
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

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function fieldValue(rawValue: unknown, alt: unknown) {
  const raw = cleanText(rawValue);
  const slackLink = raw.match(/^<([^|>]+)(?:\|([^>]+))?>$/);
  const url = slackLink?.[1]?.startsWith("http") ? slackLink[1] : /^https?:\/\//i.test(raw) ? raw : "";
  const displayValue = cleanText(slackLink?.[2] || alt || slackLink?.[1] || raw);
  return { value: raw, displayValue, url };
}

export async function GET(_request: Request, context: RouteContext<"/api/people/[id]">) {
  const { id } = await context.params;
  if (!/^[A-Z0-9]+$/i.test(id)) return Response.json({ error: "Invalid Slack user ID" }, { status: 400 });

  try {
    const session = await readSession();
    const [profileResponse, sectionsResponse, extrasResponse, schema] = await Promise.all([
      slackRequest(session, "users.profile.get", { user: id }),
      slackRequest(session, "users.profile.getSections", { user: id, _x_reason: "profiles", _x_mode: "online", _x_sonic: "true", _x_app_name: "client" }),
      slackRequest(session, "users.profile.getExtras", { user: id, keys: "im_mpim_ids", _x_reason: "useProfileExtras", _x_mode: "online", _x_sonic: "true", _x_app_name: "client" }),
      profileSchema(session),
    ]);

    const profile = profileResponse.profile || {};
    const definitions = new Map(schema.fields.map((field) => [field.id, field]));
    const sections = new Map(schema.sections.map((section) => [section.id, section]));
    const details = Object.entries(profile.fields || {}).flatMap(([fieldId, rawField]) => {
      const field = rawField as { value?: unknown; alt?: unknown };
      const normalized = fieldValue(field.value, field.alt);
      if (!normalized.displayValue) return [];
      const definition = definitions.get(fieldId);
      const section = definition?.section_id ? sections.get(definition.section_id) : undefined;
      return [{
        id: fieldId,
        label: definition?.label || definition?.field_name || "Profile detail",
        type: definition?.type || "text",
        section: section?.label || "Additional information",
        sectionOrder: Number(section?.order || 99),
        order: Number(definition?.ordering || 99),
        ...normalized,
      }];
    }).sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order || a.label.localeCompare(b.label));

    const profileSections = sectionsResponse.result?.data?.user?.profileSections || [];
    return Response.json({
      profile: {
        title: cleanText(profile.title), phone: cleanText(profile.phone), skype: cleanText(profile.skype),
        realName: cleanText(profile.real_name), displayName: cleanText(profile.display_name),
        firstName: cleanText(profile.first_name), lastName: cleanText(profile.last_name), email: cleanText(profile.email),
        statusText: cleanText(profile.status_text), statusEmoji: cleanText(profile.status_emoji),
        statusExpiration: Number(profile.status_expiration || 0), imageOriginal: cleanText(profile.image_original),
      },
      details,
      sections: profileSections.map((section: { label?: string; type?: string; profileElements?: unknown[] }) => ({ label: section.label || section.type, count: section.profileElements?.length || 0 })),
      extras: {
        onboardingComplete: Boolean(extrasResponse.onboarding_complete),
        channelCount: Array.isArray(extrasResponse.channels) ? extrasResponse.channels.length : 0,
        sharedChannelCount: Array.isArray(extrasResponse.shared_channels) ? extrasResponse.shared_channels.length : 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Slack profile";
    const missingSession = /session\.json|ENOENT/i.test(message);
    return Response.json({ error: missingSession ? "Slack profile session is not configured" : message }, { status: missingSession ? 503 : 502 });
  }
}
