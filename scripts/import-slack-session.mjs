import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const payloadPath = process.argv[2];
const outputPath = resolve(".slack/session.json");

if (!payloadPath) {
  console.error("Usage: node scripts/import-slack-session.mjs <curl-payload.txt>");
  process.exit(1);
}

const payload = await readFile(resolve(payloadPath), "utf8");
const requestUrl = payload.match(/curl --url '([^']+)'/s)?.[1];
const cookie = payload.match(/-b '([^']+)'/s)?.[1];
const token = payload.match(/name="token"\\r\\n\\r\\n([^\\]+)/s)?.[1];

if (!requestUrl || !cookie || !token) {
  throw new Error("Could not find the Slack URL, cookie, and token in the curl payload.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  origin: new URL(requestUrl).origin,
  token,
  cookie,
  importedAt: new Date().toISOString(),
}), { encoding: "utf8", mode: 0o600 });

console.log(`Imported the Slack session to ${outputPath}. This file is git-ignored.`);
