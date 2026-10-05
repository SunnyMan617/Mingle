import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { getApprovedAuthContext } from "@/lib/auth";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { cleanText, detailsFromProfileFields, detailsFromSections, mergeProfileDetails } from "@/lib/slack-profile";

type SlackSession = { origin: string; token: string; cookie: string; slackRoute?: string };
type SlackField = {
  id: string;
  label?: string;
  field_name?: string;
  type?: string;
  ordering?: number;
  section_id?: string;
};
type SlackSection = { id: string; label?: string; order?: number };
type ProfileDetailField = {
  id: string; label: string; type: string; section: string; value: string; displayValue: string; url: string;
};
type DetailedProfile = {
  title?: string; phone?: string; skype?: string; realName?: string; displayName?: string;
  firstName?: string; lastName?: string; email?: string; statusText?: string; statusEmoji?: string;
  details?: ProfileDetailField[];
};
type ProfileDetailsSnapshot = { profiles: Record<string, DetailedProfile> };

const DIRECTORY_BUCKET = process.env.SUPABASE_DIRECTORY_BUCKET || "mingle-directory-data";
const REMOTE_CACHE_TTL = 5 * 60 * 1000;
const gunzipAsync = promisify(gunzip);

let schemaPromise: Promise<{ fields: SlackField[]; sections: SlackSection[] }> | null = null;
let remoteProfileDetailsCache: ProfileDetailsSnapshot | null = null;
let remoteProfileDetailsCachedAt = 0;

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

function slackQuery(session: SlackSession, query: Record<string, string> = {}) {
  return {
    ...(session.slackRoute ? { slack_route: session.slackRoute } : {}),
    _x_gantry: "true",
    ...query,
  };
}

async function slackRequest(session: SlackSession, endpoint: string, fields: Record<string, string> = {}, query: Record<string, string> = {}) {
  const body = new FormData();
  body.append("token", session.token);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  const search = new URLSearchParams(slackQuery(session, query)).toString();
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

async function readProfileDetailsSnapshot(): Promise<ProfileDetailsSnapshot | null> {
  if (process.env.DIRECTORY_DATA_SOURCE !== "remote") {
    try {
      return JSON.parse(await readFile(join(process.cwd(), ".data", "slack-profile-details.json"), "utf8")) as ProfileDetailsSnapshot;
    } catch {
      // Deployed functions do not contain the git-ignored local snapshot.
    }
  }

  try {
    if (remoteProfileDetailsCache && Date.now() - remoteProfileDetailsCachedAt < REMOTE_CACHE_TTL) {
      return remoteProfileDetailsCache;
    }
    const supabase = createAuthAdminClient();
    const { data, error } = await supabase.storage.from(DIRECTORY_BUCKET).download("snapshots/slack-profile-details.json.gz");
    if (error) throw error;
    remoteProfileDetailsCache = JSON.parse((await gunzipAsync(Buffer.from(await data.arrayBuffer()))).toString("utf8")) as ProfileDetailsSnapshot;
    remoteProfileDetailsCachedAt = Date.now();
    return remoteProfileDetailsCache;
  } catch {
    return null;
  }
}

function snapshotResponse(profile: DetailedProfile) {
  const details = profile.details || [];
  const sectionCounts = new Map<string, number>();
  for (const field of details) {
    sectionCounts.set(field.section || "Additional information", (sectionCounts.get(field.section || "Additional information") || 0) + 1);
  }
  return {
    profile: {
      title: cleanText(profile.title), phone: cleanText(profile.phone), skype: cleanText(profile.skype),
      realName: cleanText(profile.realName), displayName: cleanText(profile.displayName),
      firstName: cleanText(profile.firstName), lastName: cleanText(profile.lastName), email: cleanText(profile.email),
      statusText: cleanText(profile.statusText), statusEmoji: cleanText(profile.statusEmoji),
      statusExpiration: 0, imageOriginal: "",
    },
    details,
    sections: [...sectionCounts.entries()].map(([label, count]) => ({ label, count })),
    extras: { onboardingComplete: false, channelCount: 0, sharedChannelCount: 0 },
  };
}

export async function GET(_request: Request, context: RouteContext<"/api/people/[id]">) {
  const auth = await getApprovedAuthContext();
  if (!auth) return Response.json({ error: "Approved account required." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[A-Z0-9]+$/i.test(id)) return Response.json({ error: "Invalid Slack user ID" }, { status: 400 });

  try {
    const session = await readSession();
    const [profileResponse, sectionsResponse, extrasResponse, schema] = await Promise.all([
      slackRequest(session, "users.profile.get", {
        user: id,
        include_labels: "true",
        _x_reason: "with-call-menu",
        _x_mode: "online",
        _x_sonic: "true",
        _x_app_name: "client",
      }),
      slackRequest(session, "users.profile.getSections", {
        user: id,
        _x_reason: "profiles",
        _x_mode: "online",
        _x_sonic: "true",
        _x_app_name: "client",
      }).catch(() => ({})),
      slackRequest(session, "users.profile.getExtras", {
        user: id,
        keys: "im_mpim_ids",
        _x_reason: "useProfileExtras",
        _x_mode: "online",
        _x_sonic: "true",
        _x_app_name: "client",
      }).catch(() => ({})),
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
    const snapshot = await readProfileDetailsSnapshot();
    const cached = snapshot?.profiles?.[id];
    if (cached) return Response.json(snapshotResponse(cached));

    const message = error instanceof Error ? error.message : "Could not load Slack profile";
    const missingSession = /session\.json|ENOENT|session is not configured/i.test(message);
    const expiredSession = /invalid_auth|token_revoked|not_authed/i.test(message);
    return Response.json({
      error: missingSession
        ? "Slack profile session is not configured"
        : expiredSession
          ? "Slack session expired"
          : message,
    }, { status: missingSession || expiredSession ? 503 : 502 });
  }
}
