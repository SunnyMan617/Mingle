import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.AUTH_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY
  || process.env.AUTH_SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_DIRECTORY_BUCKET || "mingle-directory-data";
const gzipAsync = promisify(gzip);

if (!url || !secret) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY before publishing directory data.");

const snapshots = [
  { local: join(process.cwd(), ".data", "slack-users.json"), remote: "snapshots/slack-users.json.gz" },
  { local: join(process.cwd(), ".data", "slack-profile-index.json"), remote: "snapshots/slack-profile-index.json.gz" },
];

for (const snapshot of snapshots) {
  await stat(snapshot.local);
  JSON.parse(await readFile(snapshot.local, "utf8"));
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && bucketLookupError.statusCode !== "404") throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    allowedMimeTypes: ["application/json", "application/gzip"],
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error) throw error;
} else {
  const { error } = await supabase.storage.updateBucket(bucket, {
    public: false,
    allowedMimeTypes: ["application/json", "application/gzip"],
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error) throw error;
}

for (const snapshot of snapshots) {
  const body = await readFile(snapshot.local);
  const compressed = await gzipAsync(body, { level: 9 });
  const { error } = await supabase.storage.from(bucket).upload(snapshot.remote, compressed, {
    contentType: "application/gzip",
    cacheControl: "300",
    upsert: true,
  });
  if (error) throw error;
  console.log(`Published ${snapshot.remote} (${(compressed.length / 1024 / 1024).toFixed(2)} MB compressed from ${(body.length / 1024 / 1024).toFixed(2)} MB)`);
}

console.log(`Private directory snapshot is ready in bucket: ${bucket}`);
