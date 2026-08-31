import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const directoryPath = resolve(".data/slack-users.json");
const sessionPath = resolve(".slack/session.json");
const outputPath = resolve(".data/slack-profile-index.json");
const detailsOutputPath = resolve(".data/slack-profile-details.json");
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
let existingDetails = { profiles: {} };
try { existingDetails = JSON.parse(await readFile(detailsOutputPath, "utf8")); } catch {}

const schema = await slackRequest("team.profile.get");
const fieldDefinitions = new Map((schema.profile?.fields || []).map((field) => [field.id, field]));
const sectionDefinitions = new Map((schema.profile?.sections || []).map((section) => [section.id, section]));
const labels = new Map([...fieldDefinitions].map(([id, field]) => [id, String(field.label || field.field_name || "").toLowerCase()]));
const allUsers = directory.users || [];
const profiles = { ...(existing.profiles || {}) };
const profileDetails = { ...(existingDetails.profiles || {}) };
const currentUserIds = new Set(allUsers.map((person) => String(person.id)));
for (const profileId of Object.keys(profiles)) {
  if (!currentUserIds.has(profileId)) delete profiles[profileId];
}
for (const profileId of Object.keys(profileDetails)) {
  if (!currentUserIds.has(profileId)) delete profileDetails[profileId];
}
const pending = allUsers.filter((person) => !profiles[person.id] || !profileDetails[person.id]);
const selected = requestedLimit > 0 ? pending.slice(0, requestedLimit) : pending;
let completed = 0;

function hasLabeledValue(profile, expectedLabel) {
  return Object.entries(profile.fields || {}).some(([id, field]) => labels.get(id) === expectedLabel && String(field?.value || "").trim());
}

function cleanText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function fieldValue(rawValue, alt) {
  const raw = cleanText(rawValue);
  const slackLink = raw.match(/^<([^|>]+)(?:\|([^>]+))?>$/);
  const url = slackLink?.[1]?.startsWith("http") ? slackLink[1] : /^https?:\/\//i.test(raw) ? raw : "";
  return { value: raw, displayValue: cleanText(slackLink?.[2] || alt || slackLink?.[1] || raw), url };
}

function detailedProfile(profile) {
  const details = Object.entries(profile.fields || {}).flatMap(([fieldId, rawField]) => {
    const normalized = fieldValue(rawField?.value, rawField?.alt);
    if (!normalized.displayValue) return [];
    const definition = fieldDefinitions.get(fieldId);
    const section = definition?.section_id ? sectionDefinitions.get(definition.section_id) : undefined;
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

  return {
    title: cleanText(profile.title), phone: cleanText(profile.phone), skype: cleanText(profile.skype),
    realName: cleanText(profile.real_name), displayName: cleanText(profile.display_name),
    firstName: cleanText(profile.first_name), lastName: cleanText(profile.last_name), email: cleanText(profile.email),
    statusText: cleanText(profile.status_text), statusEmoji: cleanText(profile.status_emoji), locale: cleanText(profile.locale),
    details,
  };
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
  profileDetails[person.id] = detailedProfile(profile);
  completed += 1;
}

async function saveIndex() {
  const indexedCount = Object.keys(profiles).length;
  const output = {
    syncedAt: new Date().toISOString(), total: allUsers.length, indexedCount,
    complete: indexedCount >= allUsers.length, profiles,
  };
  const detailsOutput = {
    syncedAt: output.syncedAt, total: allUsers.length, indexedCount: Object.keys(profileDetails).length,
    complete: Object.keys(profileDetails).length >= allUsers.length, profiles: profileDetails,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.tmp`, JSON.stringify(output), "utf8");
  await rename(`${outputPath}.tmp`, outputPath);
  await writeFile(`${detailsOutputPath}.tmp`, JSON.stringify(detailsOutput), "utf8");
  await rename(`${detailsOutputPath}.tmp`, detailsOutputPath);
}

console.log(`Indexing ${selected.length} pending detailed profiles with concurrency ${concurrency} (${Object.keys(profileDetails).length}/${allUsers.length} already detailed)...`);
for (let start = 0; start < selected.length; start += concurrency) {
  const batch = selected.slice(start, start + concurrency);
  await Promise.all(batch.map(indexPerson));
  if (completed % 200 === 0 || completed === selected.length) {
    await saveIndex();
    console.log(`Indexed ${Object.keys(profiles).length}/${allUsers.length} profiles`);
  }
}

if (selected.length === 0) await saveIndex();
console.log(`Profile filter and detailed snapshots saved (${Object.keys(profileDetails).length}/${allUsers.length} detailed)`);
