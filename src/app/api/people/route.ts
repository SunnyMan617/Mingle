import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { people as demoPeople, Person } from "@/data/people";
import { timezoneGeo } from "@/lib/timezone-geo";
import { getApprovedAuthContext } from "@/lib/auth";
import { createAuthAdminClient } from "@/lib/supabase/admin";

type CacheFile = {
  syncedAt: string;
  workspace: string;
  reportedTotal: number;
  users: Person[];
};

type Facet = { value: string; count: number };
type ProfileFlags = { hasTitle: boolean; hasEmail: boolean; hasPhone: boolean; hasPhoto: boolean };
type ProfileIndex = { profiles: Record<string, ProfileFlags>; complete?: boolean; indexedCount?: number };
type SentRow = { slack_user_id: string; marked_at: string };

let memoryCache: CacheFile | null = null;
let memoryCacheModifiedAt = 0;
let profileIndexCache: ProfileIndex | null = null;
let profileIndexModifiedAt = 0;
let remoteDirectoryCache: CacheFile | null = null;
let remoteDirectoryCachedAt = 0;
let remoteProfileIndexCache: ProfileIndex | null = null;
let remoteProfileIndexCachedAt = 0;

const DIRECTORY_BUCKET = process.env.SUPABASE_DIRECTORY_BUCKET || "mingle-directory-data";
const REMOTE_CACHE_TTL = 5 * 60 * 1000;
const gunzipAsync = promisify(gunzip);

async function readRemoteJson<T>(path: string): Promise<T> {
  const supabase = createAuthAdminClient();
  const { data, error } = await supabase.storage.from(DIRECTORY_BUCKET).download(path);
  if (error) throw new Error(`Unable to download ${path}: ${error.message}`);
  const json = await gunzipAsync(Buffer.from(await data.arrayBuffer()));
  return JSON.parse(json.toString("utf8")) as T;
}

async function readProfileIndex(): Promise<ProfileIndex | null> {
  const indexPath = join(process.cwd(), ".data", "slack-profile-index.json");
  if (process.env.DIRECTORY_DATA_SOURCE !== "remote") {
    try {
      const details = await stat(indexPath);
      if (!profileIndexCache || details.mtimeMs !== profileIndexModifiedAt) {
        profileIndexCache = JSON.parse(await readFile(indexPath, "utf8")) as ProfileIndex;
        profileIndexModifiedAt = details.mtimeMs;
      }
      return profileIndexCache;
    } catch {
      // Deployed functions do not contain the git-ignored local snapshot.
    }
  }

  try {
    if (remoteProfileIndexCache && Date.now() - remoteProfileIndexCachedAt < REMOTE_CACHE_TTL) {
      return remoteProfileIndexCache;
    }
    remoteProfileIndexCache = await readRemoteJson<ProfileIndex>("snapshots/slack-profile-index.json.gz");
    remoteProfileIndexCachedAt = Date.now();
    return remoteProfileIndexCache;
  } catch {
    return null;
  }
}

async function readDirectory(): Promise<{ data: CacheFile; source: "slack" | "demo" }> {
  const cachePath = join(process.cwd(), ".data", "slack-users.json");

  if (process.env.DIRECTORY_DATA_SOURCE !== "remote") {
    try {
      const details = await stat(cachePath);
      if (!memoryCache || details.mtimeMs !== memoryCacheModifiedAt) {
        const parsed = JSON.parse(await readFile(cachePath, "utf8")) as CacheFile;
        parsed.users = parsed.users.map((person) => ({ ...person, ...timezoneGeo(person.timezone, person.location) }));
        memoryCache = parsed;
        memoryCacheModifiedAt = details.mtimeMs;
      }
      return { data: memoryCache, source: "slack" };
    } catch {
      // Fall through to the private remote snapshot.
    }
  }

  try {
    if (!remoteDirectoryCache || Date.now() - remoteDirectoryCachedAt >= REMOTE_CACHE_TTL) {
      const parsed = await readRemoteJson<CacheFile>("snapshots/slack-users.json.gz");
      parsed.users = parsed.users.map((person) => ({ ...person, ...timezoneGeo(person.timezone, person.location) }));
      remoteDirectoryCache = parsed;
      remoteDirectoryCachedAt = Date.now();
    }
    return { data: remoteDirectoryCache, source: "slack" };
  } catch (error) {
    if (process.env.NODE_ENV === "production" || process.env.DIRECTORY_DATA_SOURCE === "remote") throw error;
    return {
      source: "demo",
      data: {
        syncedAt: "",
        workspace: "demo",
        reportedTotal: demoPeople.length,
        users: demoPeople.map((person) => ({ ...person, ...timezoneGeo(person.timezone, person.location) })),
      },
    };
  }
}

async function readSentStatuses(userIds: string[]) {
  if (userIds.length === 0) return { available: true, rows: new Map<string, string>() };

  const admin = createAuthAdminClient();
  const { data, error } = await admin
    .from("sent_users")
    .select("slack_user_id,marked_at")
    .in("slack_user_id", userIds);

  if (error) {
    const missingTable = error.code === "PGRST205" || error.code === "42P01" || /sent_users|schema cache/i.test(error.message);
    if (!missingTable) console.error("Unable to load sent-user status", { code: error.code });
    return { available: false, rows: new Map<string, string>() };
  }

  return {
    available: true,
    rows: new Map((data as SentRow[]).map((row) => [row.slack_user_id, row.marked_at])),
  };
}

function buildFacets(values: string[], limit = 100): Facet[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function csvCell(value: string | number | boolean | undefined) {
  const normalized = String(value ?? "").replace(/[\r\n]+/g, " ");
  const safe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replace(/"/g, '""')}"`;
}

function peopleCsv(people: Person[], profileFlags: (person: Person) => ProfileFlags) {
  const columns = [
    "Slack ID", "Name", "Job title", "Professional group", "Slack username",
    "Region", "Country", "Time zone", "Slack status", "Status message",
    "Email", "Phone", "Has photo",
  ];
  const rows = people.map((person) => {
    const flags = profileFlags(person);
    return [
      person.id, person.name, person.title, person.department, person.username,
      person.region, person.country, person.location, person.status, person.statusText,
      person.email, person.phone, flags.hasPhoto ? "Yes" : "No",
    ].map(csvCell).join(",");
  });

  return `\uFEFF${[columns.map(csvCell).join(","), ...rows].join("\r\n")}`;
}

export async function GET(request: Request) {
  const auth = await getApprovedAuthContext();
  if (!auth) return Response.json({ error: "Approved account required." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  let directory: Awaited<ReturnType<typeof readDirectory>>;
  let profileIndex: ProfileIndex | null;
  try {
    [directory, profileIndex] = await Promise.all([readDirectory(), readProfileIndex()]);
  } catch (error) {
    console.error("Directory snapshot unavailable", error);
    return Response.json({ error: "The synced directory snapshot is temporarily unavailable." }, { status: 503 });
  }
  const { data, source } = directory;
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const department = searchParams.get("department") || "All";
  const location = searchParams.get("location") || "All";
  const region = searchParams.get("region") || "All";
  const country = searchParams.get("country") || "All";
  const status = searchParams.get("status") || "All";
  const profileFilters = (searchParams.get("profile") || "").split(",").filter(Boolean);
  const sort = searchParams.get("sort") || "name-asc";
  const perPage = Math.max(9, Math.min(60, Number(searchParams.get("perPage")) || 30));
  const requestedPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const profileFlags = (person: Person): ProfileFlags => profileIndex?.profiles[String(person.id)] || {
    hasTitle: person.title !== "Community member",
    hasEmail: Boolean(person.email),
    hasPhone: Boolean(person.phone),
    hasPhoto: person.hasPhoto ?? person.avatar.includes("avatars.slack-edge.com"),
  };

  const filtered = data.users.filter((person) => {
    const searchable = [person.name, person.title, person.department, person.location, person.username, person.bio, ...person.skills]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!query || searchable.includes(query))
      && (department === "All" || person.department === department)
      && (location === "All" || person.location === location)
      && (region === "All" || person.region === region)
      && (country === "All" || person.country === country)
      && (status === "All" || person.status === status)
      && profileFilters.every((profile) => {
        const flags = profileFlags(person);
        return (profile === "Has title" && flags.hasTitle)
          || (profile === "Has email" && flags.hasEmail)
          || (profile === "Has phone" && flags.hasPhone)
          || (profile === "Has photo" && flags.hasPhoto);
      });
  });

  filtered.sort((a, b) => {
    if (sort === "name-desc") return b.name.localeCompare(a.name);
    if (sort === "department") return a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
    if (sort === "title") return a.title.localeCompare(b.title) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  if (searchParams.get("format") === "csv") {
    return new Response(peopleCsv(filtered, profileFlags), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="techqueria-people.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * perPage;
  const pagePeople = filtered.slice(start, start + perPage);
  const sentStatuses = await readSentStatuses(pagePeople.map((person) => String(person.id)));

  return Response.json({
    people: pagePeople.map((person) => ({
      ...person,
      isSent: sentStatuses.rows.has(String(person.id)),
      sentAt: sentStatuses.rows.get(String(person.id)),
    })),
    pagination: {
      page,
      perPage,
      pageCount,
      totalCount: filtered.length,
    },
    facets: {
      departments: buildFacets(data.users.map((person) => person.department), 20),
      locations: buildFacets(data.users.map((person) => person.location), 100),
      regions: buildFacets(data.users.map((person) => person.region || "Unspecified"), 20),
      countries: buildFacets(data.users.map((person) => person.country || "Unspecified"), 100),
    },
    stats: {
      total: data.users.length,
      withTitle: data.users.filter((person) => person.title !== "Community member").length,
      withStatus: data.users.filter((person) => Boolean(person.statusEmoji) || person.status === "Away").length,
    },
    source,
    workspace: data.workspace,
    syncedAt: data.syncedAt,
    sentTrackingAvailable: sentStatuses.available,
    profileIndex: { complete: Boolean(profileIndex?.complete), indexedCount: Number(profileIndex?.indexedCount || 0) },
  });
}
