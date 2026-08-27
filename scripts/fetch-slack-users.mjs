import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const payloadPath = process.argv[2];
const outputPath = resolve(process.argv[3] || ".data/slack-users.json");

if (!payloadPath) {
  console.error("Usage: node scripts/fetch-slack-users.mjs <curl-payload.txt> [output.json]");
  process.exit(1);
}

const payload = await readFile(resolve(payloadPath), "utf8");
const searchUrl = payload.match(/curl --url '([^']+)'/s)?.[1];
const cookie = payload.match(/-b '([^']+)'/s)?.[1];
const token = payload.match(/name="token"\\r\\n\\r\\n([^\\]+)/s)?.[1];

if (!searchUrl || !cookie || !token) {
  throw new Error("Could not find the Slack URL, cookie, and token in the supplied curl payload.");
}

const workspaceUrl = new URL(searchUrl);
const usersUrl = `${workspaceUrl.origin}/api/users.list`;
const teamProfileUrl = `${workspaceUrl.origin}/api/team.profile.get`;
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function fetchUsers(cursor = "", attempt = 1) {
  const form = new FormData();
  form.append("token", token);
  form.append("limit", "1000");
  form.append("include_locale", "true");
  if (cursor) form.append("cursor", cursor);

  try {
    const response = await fetch(usersUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        cookie,
        origin: "https://app.slack.com",
        "user-agent": "Mozilla/5.0 SlackDirectoryImporter/1.0",
      },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });

    if (response.status === 429) {
      const waitSeconds = Number(response.headers.get("retry-after") || 5);
      if (attempt <= 6) {
        await delay(waitSeconds * 1_000);
        return fetchUsers(cursor, attempt + 1);
      }
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Slack returned ok=false");
    return data;
  } catch (error) {
    if (attempt <= 5) {
      await delay(Math.min(12_000, 750 * 2 ** attempt));
      return fetchUsers(cursor, attempt + 1);
    }
    throw new Error(`Slack users.list failed after retries: ${error.message}`);
  }
}

async function fetchProfileSchema(attempt = 1) {
  const form = new FormData();
  form.append("token", token);

  try {
    const response = await fetch(teamProfileUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        cookie,
        origin: "https://app.slack.com",
        "user-agent": "Mozilla/5.0 SlackDirectoryImporter/1.0",
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Slack returned ok=false");
    return data.profile?.fields || [];
  } catch (error) {
    if (attempt <= 4) {
      await delay(Math.min(8_000, 750 * 2 ** attempt));
      return fetchProfileSchema(attempt + 1);
    }
    console.warn(`Could not load profile field labels: ${error.message}`);
    return [];
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<mailto:([^|>]+)(?:\|[^>]+)?>/g, "$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function inferDepartment(title) {
  const value = title.toLowerCase();
  if (/engineer|developer|devops|architect|infrastructure|cloud|technical|data scientist/.test(value)) return "Engineering";
  if (/design|ux|ui|research|creative|artist/.test(value)) return "Design";
  if (/product|program|project|scrum/.test(value)) return "Product";
  if (/marketing|content|brand|seo|growth|sales|account/.test(value)) return "Marketing & Sales";
  if (/people|talent|recruit|human resources|culture|coach/.test(value)) return "People";
  if (/finance|financial|accountant|revenue/.test(value)) return "Finance";
  if (/student|learner|graduate/.test(value)) return "Students";
  if (/founder|chief|director|vp |vice president|executive/.test(value)) return "Leadership";
  return "Community";
}

function inferSkills(title, department, customFields) {
  const words = title
    .replace(/[^a-zA-Z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["the", "and", "with", "senior", "lead"].includes(word.toLowerCase()))
    .slice(0, 3);
  return [...new Set([...words, department, ...customFields.slice(0, 1)])].slice(0, 4);
}

function mapUser(member, fieldDefinitions) {
  const profile = member.profile || {};
  const name = cleanText(profile.display_name || profile.real_name || member.real_name || member.name || member.id) || "Unnamed member";
  const title = cleanText(profile.title) || "Community member";
  const department = inferDepartment(title);
  const customFields = Object.entries(profile.fields || {})
    .map(([id, field]) => ({
      id,
      label: fieldDefinitions[id]?.label || fieldDefinitions[id]?.field_name || "Profile detail",
      type: fieldDefinitions[id]?.type || "text",
      value: cleanText(field?.value),
      alt: cleanText(field?.alt),
    }))
    .filter((field) => field.value);
  const statusText = cleanText(profile.status_text);

  return {
    id: member.id,
    name,
    title,
    department,
    location: cleanText(member.tz_label) || "Techqueria workspace",
    status: statusText ? "Away" : "Available",
    workMode: "Remote",
    avatar: profile.image_512 || profile.image_192 || profile.image_72 || profile.image_48 || "",
    email: cleanText(profile.email),
    phone: cleanText(profile.phone),
    timezone: cleanText(member.tz) || cleanText(member.tz_label),
    localTime: "",
    joined: "Techqueria member",
    bio: statusText || `${name} is a member of the Techqueria community.`,
    skills: inferSkills(title, department, customFields.map((field) => field.value)),
    projects: customFields.slice(0, 2).map((field) => field.value),
    username: cleanText(member.name),
    statusEmoji: cleanText(profile.status_emoji),
    statusText,
    statusExpiration: Number(profile.status_expiration || 0),
    realName: cleanText(profile.real_name || member.real_name),
    displayName: cleanText(profile.display_name),
    firstName: cleanText(profile.first_name),
    lastName: cleanText(profile.last_name),
    skype: cleanText(profile.skype),
    locale: cleanText(member.locale),
    isRestricted: Boolean(member.is_restricted),
    isUltraRestricted: Boolean(member.is_ultra_restricted),
    customFields,
    hasPhoto: Boolean(profile.image_original || (profile.avatar_hash && !String(profile.avatar_hash).startsWith("g"))),
  };
}

console.log("Reading the complete Slack member list with cursor pagination...");
const members = [];
let cursor = "";
let requestCount = 0;

do {
  const response = await fetchUsers(cursor);
  members.push(...(response.members || []));
  cursor = response.response_metadata?.next_cursor || "";
  requestCount += 1;
  console.log(`Fetched ${members.length} raw members across ${requestCount} cursor page${requestCount === 1 ? "" : "s"}`);
} while (cursor);

const activeMembers = members.filter((member) => !member.deleted && !member.is_bot && member.id !== "USLACKBOT");
const profileSchema = await fetchProfileSchema();
const fieldDefinitions = Object.fromEntries(profileSchema.map((field) => [field.id, field]));
console.log(`Loaded ${profileSchema.length} workspace profile field definitions`);
const users = [...new Map(activeMembers.map((member) => {
  const user = mapUser(member, fieldDefinitions);
  return [user.id, user];
})).values()].sort((a, b) => a.name.localeCompare(b.name));

const output = {
  syncedAt: new Date().toISOString(),
  workspace: workspaceUrl.hostname.split(".")[0],
  reportedTotal: users.length,
  rawMemberTotal: members.length,
  profileFieldCount: profileSchema.length,
  users,
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, JSON.stringify(output), "utf8");
await rename(temporaryPath, outputPath);
console.log(`Saved ${users.length} active human profiles to ${outputPath}`);
