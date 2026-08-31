import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const session = JSON.parse(await readFile(resolve(".slack/session.json"), "utf8"));
const directory = JSON.parse(await readFile(resolve(".data/slack-users.json"), "utf8"));
const outputPath = resolve(".data/slack-profile-index.json");
const detailsOutputPath = resolve(".data/slack-profile-details.json");
const existing = JSON.parse(await readFile(outputPath, "utf8").catch(() => '{"profiles":{}}'));
const existingDetails = JSON.parse(await readFile(detailsOutputPath, "utf8").catch(() => '{"profiles":{}}'));
const profiles = { ...(existing.profiles || {}) };
const profileDetails = { ...(existingDetails.profiles || {}) };
const concurrency = Math.max(1, Math.min(60, Number(process.env.SLACK_SEARCH_CONCURRENCY || 20)));
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const currentUserIds = new Set((directory.users || []).map((person) => String(person.id)));
for (const userId of Object.keys(profiles)) if (!currentUserIds.has(userId)) delete profiles[userId];
for (const userId of Object.keys(profileDetails)) if (!currentUserIds.has(userId)) delete profileDetails[userId];

async function request(endpoint, fields, attempt = 1) {
  const body = new FormData();
  body.append("token", session.token);
  for (const [key, value] of Object.entries(fields || {})) body.append(key, String(value));
  try {
    const response = await fetch(`${session.origin}/api/${endpoint}`, {
      method: "POST",
      headers: { accept: "application/json, text/plain, */*", cookie: session.cookie, origin: "https://app.slack.com", "user-agent": "Mozilla/5.0 MingleSearchIndexer/1.0" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429) {
      if (attempt > 20) throw new Error("Slack rate limit did not clear");
      await delay(Number(response.headers.get("retry-after") || 5) * 1_000);
      return request(endpoint, fields, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || `${endpoint} returned ok=false`);
    return data;
  } catch (error) {
    if (attempt <= 5) { await delay(Math.min(10_000, 500 * 2 ** attempt)); return request(endpoint, fields, attempt + 1); }
    throw error;
  }
}

const schema = await request("team.profile.get");
const fieldDefinitions = new Map((schema.profile?.fields || []).map((field) => [field.id, field]));
const sectionDefinitions = new Map((schema.profile?.sections || []).map((section) => [section.id, section]));
const labels = new Map([...fieldDefinitions].map(([id, field]) => [id, String(field.label || field.field_name || "").toLowerCase()]));

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
  const displayValue = cleanText(slackLink?.[2] || alt || slackLink?.[1] || raw);
  return { value: raw, displayValue, url };
}

function detailedProfile(item) {
  const profile = item.profile || {};
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
    title: cleanText(profile.title),
    phone: cleanText(profile.phone || item.phone),
    skype: cleanText(profile.skype),
    realName: cleanText(profile.real_name || item.real_name),
    displayName: cleanText(profile.display_name),
    firstName: cleanText(profile.first_name),
    lastName: cleanText(profile.last_name),
    email: cleanText(profile.email),
    statusText: cleanText(profile.status_text),
    statusEmoji: cleanText(profile.status_emoji),
    locale: cleanText(item.locale),
    details,
  };
}

function hasLabeledValue(profile, label) {
  return Object.entries(profile.fields || {}).some(([id, field]) => labels.get(id) === label && String(field?.value || "").trim());
}

function indexItems(items) {
  for (const item of items || []) {
    if (!currentUserIds.has(String(item.id))) continue;
    const profile = item.profile || {};
    profiles[item.id] = {
      hasTitle: Boolean(String(profile.title || "").trim() || hasLabeledValue(profile, "title")),
      hasEmail: Boolean(String(profile.email || "").trim() || hasLabeledValue(profile, "email")),
      hasPhone: Boolean(String(profile.phone || item.phone || "").trim() || hasLabeledValue(profile, "phone")),
      hasPhoto: Boolean(profile.image_original || profile.is_custom_image || (profile.avatar_hash && !String(profile.avatar_hash).startsWith("g"))),
    };
    profileDetails[item.id] = detailedProfile(item);
  }
}

async function searchPage(query, page) {
  return request("search.modules.people", {
    module: "people", query, page, count: 50, extracts: 0, highlight: 0, no_user_profile: 0,
    browse: "standard", search_context: "desktop_people_browser", sort: "name", sort_dir: "asc",
    hide_deactivated_users: 1, custom_fields: "{}", _x_mode: "online", _x_app_name: "client",
  });
}

async function save() {
  const indexedCount = Object.keys(profiles).length;
  const syncedAt = new Date().toISOString();
  const output = { syncedAt, total: directory.users.length, indexedCount, complete: indexedCount >= directory.users.length, profiles };
  const detailedCount = Object.keys(profileDetails).length;
  const detailsOutput = { syncedAt, total: directory.users.length, indexedCount: detailedCount, complete: detailedCount >= directory.users.length, profiles: profileDetails };
  await writeFile(`${outputPath}.tmp`, JSON.stringify(output), "utf8");
  await rename(`${outputPath}.tmp`, outputPath);
  await writeFile(`${detailsOutputPath}.tmp`, JSON.stringify(detailsOutput), "utf8");
  await rename(`${detailsOutputPath}.tmp`, detailsOutputPath);
}

const queries = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
console.log(`Loading first pages for ${queries.length} search partitions...`);
const firstPages = await Promise.all(queries.map(async (query) => ({ query, data: await searchPage(query, 1) })));
for (const { data } of firstPages) indexItems(data.items);

const tasks = firstPages.flatMap(({ query, data }) => {
  const pages = Math.min(100, Number(data.pagination?.page_count || 1));
  return Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({ query, page: index + 2 }));
});
let nextTask = 0;
let completed = 0;

async function worker() {
  while (true) {
    const taskIndex = nextTask++;
    if (taskIndex >= tasks.length) return;
    const task = tasks[taskIndex];
    indexItems((await searchPage(task.query, task.page)).items);
    completed += 1;
    if (completed % 100 === 0) {
      await save();
      console.log(`Processed ${completed}/${tasks.length} search pages; ${Object.keys(profiles).length}/${directory.users.length} profiles indexed`);
    }
  }
}

console.log(`Processing ${tasks.length} additional search pages with concurrency ${concurrency}...`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));
await save();
console.log(`Search seeding complete: ${Object.keys(profiles).length}/${directory.users.length} profiles indexed`);
console.log(`Detailed profile snapshot saved: ${Object.keys(profileDetails).length}/${directory.users.length} profiles`);
