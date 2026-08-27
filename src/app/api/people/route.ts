import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { people as demoPeople, Person } from "@/data/people";
import { timezoneGeo } from "@/lib/timezone-geo";

type CacheFile = {
  syncedAt: string;
  workspace: string;
  reportedTotal: number;
  users: Person[];
};

type Facet = { value: string; count: number };
type ProfileFlags = { hasTitle: boolean; hasEmail: boolean; hasPhone: boolean; hasPhoto: boolean };
type ProfileIndex = { profiles: Record<string, ProfileFlags>; complete?: boolean; indexedCount?: number };

let memoryCache: CacheFile | null = null;
let memoryCacheModifiedAt = 0;
let profileIndexCache: ProfileIndex | null = null;
let profileIndexModifiedAt = 0;

async function readProfileIndex(): Promise<ProfileIndex | null> {
  const indexPath = join(process.cwd(), ".data", "slack-profile-index.json");
  try {
    const details = await stat(indexPath);
    if (!profileIndexCache || details.mtimeMs !== profileIndexModifiedAt) {
      profileIndexCache = JSON.parse(await readFile(indexPath, "utf8")) as ProfileIndex;
      profileIndexModifiedAt = details.mtimeMs;
    }
    return profileIndexCache;
  } catch {
    return null;
  }
}

async function readDirectory(): Promise<{ data: CacheFile; source: "slack" | "demo" }> {
  const cachePath = join(process.cwd(), ".data", "slack-users.json");

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const [{ data, source }, profileIndex] = await Promise.all([readDirectory(), readProfileIndex()]);
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * perPage;

  return Response.json({
    people: filtered.slice(start, start + perPage),
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
    profileIndex: { complete: Boolean(profileIndex?.complete), indexedCount: Number(profileIndex?.indexedCount || 0) },
  });
}
