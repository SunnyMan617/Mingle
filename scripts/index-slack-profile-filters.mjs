import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const directoryPath = resolve(".data/slack-users.json");
const sessionPath = resolve(".slack/session.json");
const outputPath = resolve(".data/slack-profile-index.json");
const concurrency = Math.max(1, Math.min(200, Number(process.env.SLACK_PROFILE_CONCURRENCY || 20)));
const requestedLimit = Number(process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1] || 0);
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const [directory, session] = await Promise.all([
  readFile(directoryPath, "utf8").then(JSON.parse),
  readFile(sessionPath, "utf8").then(JSON.parse),
]);

async function slackRequest(endpoint, fields = {}, attempt = 1) {
  const body = new FormData();
  body.append("token", session.token);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  try {
    const response = await fetch(`${session.origin}/api/${endpoint}`, {
      method: "POST",
      headers: { accept: "application/json, text/plain, */*", cookie: session.cookie, origin: "https://app.slack.com", "user-agent": "Mozilla/5.0 MingleProfileIndexer/1.0" },
      body,
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 429) {
      if (attempt > 8) throw new Error("Slack rate limit did not clear");
      await delay(Number(response.headers.get("retry-after") || 5) * 1_000);
      return slackRequest(endpoint, fields, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || `${endpoint} returned ok=false`);
    return data;
  } catch (error) {
    if (attempt <= 5) {
      await delay(Math.min(10_000, 500 * 2 ** attempt));
      return slackRequest(endpoint, fields, attempt + 1);
    }
    throw error;
  }
}

let existing = { profiles: {} };
try { existing = JSON.parse(await readFile(outputPath, "utf8")); } catch {}

const schema = await slackRequest("team.profile.get");
const labels = new Map((schema.profile?.fields || []).map((field) => [field.id, String(field.label || field.field_name || "").toLowerCase()]));
const allUsers = directory.users || [];
const pending = allUsers.filter((person) => !existing.profiles?.[person.id]);
const selected = requestedLimit > 0 ? pending.slice(0, requestedLimit) : pending;
const profiles = { ...(existing.profiles || {}) };
let completed = 0;

function hasLabeledValue(profile, expectedLabel) {
  return Object.entries(profile.fields || {}).some(([id, field]) => labels.get(id) === expectedLabel && String(field?.value || "").trim());
}

async function indexPerson(person) {
  const response = await slackRequest("users.profile.get", { user: String(person.id) });
  const profile = response.profile || {};
  profiles[person.id] = {
    hasTitle: Boolean(String(profile.title || "").trim() || hasLabeledValue(profile, "title")),
    hasEmail: Boolean(String(profile.email || "").trim() || hasLabeledValue(profile, "email")),
    hasPhone: Boolean(String(profile.phone || "").trim() || hasLabeledValue(profile, "phone")),
    hasPhoto: Boolean(profile.image_original || profile.is_custom_image || (profile.avatar_hash && !String(profile.avatar_hash).startsWith("g"))),
  };
  completed += 1;
}

async function saveIndex() {
  const indexedCount = Object.keys(profiles).length;
  const output = {
    syncedAt: new Date().toISOString(), total: allUsers.length, indexedCount,
    complete: indexedCount >= allUsers.length, profiles,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.tmp`, JSON.stringify(output), "utf8");
  await rename(`${outputPath}.tmp`, outputPath);
}

console.log(`Indexing ${selected.length} pending profiles with concurrency ${concurrency} (${Object.keys(profiles).length}/${allUsers.length} already indexed)...`);
for (let start = 0; start < selected.length; start += concurrency) {
  const batch = selected.slice(start, start + concurrency);
  await Promise.all(batch.map(indexPerson));
  if (completed % 200 === 0 || completed === selected.length) {
    await saveIndex();
    console.log(`Indexed ${Object.keys(profiles).length}/${allUsers.length} profiles`);
  }
}

if (selected.length === 0) await saveIndex();
console.log(`Profile filter index saved to ${outputPath}`);
