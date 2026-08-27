import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const session = JSON.parse(await readFile(resolve(".slack/session.json"), "utf8"));
const directory = JSON.parse(await readFile(resolve(".data/slack-users.json"), "utf8"));
const outputPath = resolve(".data/slack-profile-index.json");
const existing = JSON.parse(await readFile(outputPath, "utf8").catch(() => '{"profiles":{}}'));
const profiles = { ...(existing.profiles || {}) };
const concurrency = Math.max(1, Math.min(60, Number(process.env.SLACK_SEARCH_CONCURRENCY || 20)));
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

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
const labels = new Map((schema.profile?.fields || []).map((field) => [field.id, String(field.label || field.field_name || "").toLowerCase()]));

function hasLabeledValue(profile, label) {
  return Object.entries(profile.fields || {}).some(([id, field]) => labels.get(id) === label && String(field?.value || "").trim());
}

function indexItems(items) {
  for (const item of items || []) {
    const profile = item.profile || {};
    profiles[item.id] = {
      hasTitle: Boolean(String(profile.title || "").trim() || hasLabeledValue(profile, "title")),
      hasEmail: Boolean(String(profile.email || "").trim() || hasLabeledValue(profile, "email")),
      hasPhone: Boolean(String(profile.phone || item.phone || "").trim() || hasLabeledValue(profile, "phone")),
      hasPhoto: Boolean(profile.image_original || profile.is_custom_image || (profile.avatar_hash && !String(profile.avatar_hash).startsWith("g"))),
    };
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
  const output = { syncedAt: new Date().toISOString(), total: directory.users.length, indexedCount, complete: indexedCount >= directory.users.length, profiles };
  await writeFile(`${outputPath}.tmp`, JSON.stringify(output), "utf8");
  await rename(`${outputPath}.tmp`, outputPath);
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
