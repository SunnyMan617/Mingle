"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { Person, PersonStatus } from "@/data/people";

type IconName = "search" | "chevron" | "sliders" | "pin" | "briefcase" | "mail" | "phone" | "clock" | "calendar" | "arrow" | "close" | "users" | "sparkle";
type Facet = { value: string; count: number };
type DirectoryResponse = {
  people: Person[];
  pagination: { page: number; perPage: number; pageCount: number; totalCount: number };
  facets: { departments: Facet[]; locations: Facet[] };
  stats: { total: number; withTitle: number; withStatus: number };
  source: "slack" | "demo";
  workspace: string;
  syncedAt: string;
};
type PageToken = number | "left-gap" | "right-gap";

const PER_PAGE = 30;
const statusOptions: Array<"All" | PersonStatus> = ["All", "Available", "Away"];
const profileOptions = ["All", "Has title", "Has email", "Has phone"];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    sliders: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="9" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="12" cy="18" r="1" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    sparkle: <><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function statusClass(status: PersonStatus) {
  if (status === "Available") return "is-available";
  if (status === "In a meeting") return "is-busy";
  return "is-away";
}

function pageTokens(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const ordered = [...pages].filter((item) => item > 0 && item <= total).sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  ordered.forEach((item, index) => {
    const previous = ordered[index - 1];
    if (previous && item - previous > 1) tokens.push(previous === 1 ? "left-gap" : "right-gap");
    tokens.push(item);
  });
  return tokens;
}

function ProfileCard({ person, onOpen }: { person: Person; onOpen: (person: Person) => void }) {
  return (
    <button className="profile-card" onClick={() => onOpen(person)} aria-label={`View ${person.name}'s profile`}>
      <div className="card-topline">
        <span className="department-pill">{person.department}</span>
        <span className={`status-label ${statusClass(person.status)}`}><i />{person.status === "Away" ? "Status set" : "Member"}</span>
      </div>
      <div className="avatar-wrap">
        <Image className="avatar" src={person.avatar} alt={`${person.name} profile`} width={144} height={144} />
        <span className={`avatar-status ${statusClass(person.status)}`} />
      </div>
      <h3>{person.name}</h3>
      <p className="job-title">{person.title}</p>
      <div className="card-meta">
        <span><Icon name="pin" size={15} />{person.location}</span>
        <span><Icon name="briefcase" size={15} />{person.username ? `@${person.username}` : "Slack member"}</span>
      </div>
      <div className="skill-row">{person.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}{person.skills.length > 3 && <span>+{person.skills.length - 3}</span>}</div>
      <span className="view-profile">View profile <Icon name="arrow" size={16} /></span>
    </button>
  );
}

function ProfileModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-name">
        <button className="modal-close" onClick={onClose} ref={closeRef} aria-label="Close profile"><Icon name="close" /></button>
        <div className="modal-hero">
          <div className="modal-avatar-wrap"><Image src={person.avatar} alt={`${person.name} profile`} width={176} height={176} className="modal-avatar" priority /><span className={`avatar-status ${statusClass(person.status)}`} /></div>
          <div className="modal-heading">
            <span className={`status-label ${statusClass(person.status)}`}><i />{person.status === "Away" ? "Slack status set" : "Workspace member"}</span>
            <h2 id="profile-name">{person.name}</h2><p>{person.title}</p><span className="modal-department">{person.department}</span>
          </div>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-section"><span className="eyebrow">About</span><p className="bio">{person.bio}</p></div>
            <div className="modal-section"><span className="eyebrow">Profile keywords</span><div className="modal-skills">{person.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
            {person.projects.length > 0 && <div className="modal-section"><span className="eyebrow">Additional profile details</span><div className="project-list">{person.projects.map((project, index) => <div key={`${project}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{project}</div>)}</div></div>}
          </div>
          <aside className="contact-panel">
            <span className="eyebrow">Contact & details</span>
            {person.email && <a href={`mailto:${person.email}`}><span className="contact-icon"><Icon name="mail" /></span><span><small>Email</small>{person.email}</span></a>}
            {person.phone && <a href={`tel:${person.phone}`}><span className="contact-icon"><Icon name="phone" /></span><span><small>Phone</small>{person.phone}</span></a>}
            <div><span className="contact-icon"><Icon name="pin" /></span><span><small>Time zone</small>{person.location}</span></div>
            {person.timezone && <div><span className="contact-icon"><Icon name="clock" /></span><span><small>Time zone ID</small>{person.timezone}</span></div>}
            <div><span className="contact-icon"><Icon name="calendar" /></span><span><small>Workspace</small>{person.joined}</span></div>
            {person.email && <a className="message-button" href={`mailto:${person.email}`}><Icon name="mail" size={17} />Send a message</a>}
          </aside>
        </div>
      </section>
    </div>
  );
}

function LoadingGrid() {
  return <div className="people-grid" aria-label="Loading people">{Array.from({ length: 9 }, (_, index) => <div className="profile-card skeleton-card" key={index}><span className="skeleton-line short" /><span className="skeleton-avatar" /><span className="skeleton-line name" /><span className="skeleton-line" /><span className="skeleton-line wide" /></div>)}</div>;
}

export function PeopleDashboard() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [department, setDepartment] = useState("All");
  const [location, setLocation] = useState("All");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [profile, setProfile] = useState("All");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [directoryPeople, setDirectoryPeople] = useState<Person[]>([]);
  const [pagination, setPagination] = useState({ page: 1, perPage: PER_PAGE, pageCount: 1, totalCount: 0 });
  const [facets, setFacets] = useState<{ departments: Facet[]; locations: Facet[] }>({ departments: [], locations: [] });
  const [stats, setStats] = useState({ total: 0, withTitle: 0, withStatus: 0 });
  const [source, setSource] = useState<"slack" | "demo">("slack");
  const [syncedAt, setSyncedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page), perPage: String(PER_PAGE), q: deferredQuery,
      department, location, status, profile, sort,
    });

    fetch(`/api/people?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Directory request failed (${response.status})`);
        return response.json() as Promise<DirectoryResponse>;
      })
      .then((data) => {
        setDirectoryPeople(data.people); setPagination(data.pagination); setFacets(data.facets);
        setStats(data.stats); setSource(data.source); setSyncedAt(data.syncedAt); setError(""); setLoading(false);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") { setError(requestError.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [deferredQuery, department, location, status, profile, sort, page]);

  const activeFilters = [department, location, status, profile].filter((value) => value !== "All").length;
  const resetPage = () => setPage(1);
  const clearFilters = () => { setQuery(""); setDepartment("All"); setLocation("All"); setStatus("All"); setProfile("All"); setSort("name-asc"); resetPage(); };
  const goToPage = (nextPage: number) => { setPage(nextPage); document.getElementById("directory-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const quickDepartments = [{ value: "All", count: stats.total }, ...facets.departments.slice(0, 6)];

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Mingle home"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></a>
        <nav aria-label="Main navigation"><a className="active" href="#directory">Directory</a><a href="#teams">Teams</a><a href="#org">Org chart</a></nav>
        <div className="topbar-actions"><span className={`live-source ${source}`}><i />{source === "slack" ? "Slack synced" : "Demo data"}</span>{directoryPeople[0] && <Image src={directoryPeople[0].avatar} alt="Member profile" width={40} height={40} className="nav-avatar" />}</div>
      </header>
      <div className="page-wrap" id="top">
        <section className="hero" id="directory">
          <div><span className="kicker"><Icon name="sparkle" size={15} /> Techqueria people directory</span><h1>Find the person<br />who can <em>help.</em></h1><p>Search every synced member by name, role, keyword, or time zone.</p></div>
          <div className="hero-stats" aria-label="Directory summary"><div><strong>{stats.total.toLocaleString()}</strong><span>People</span></div><div><strong>{facets.departments.length}</strong><span>Groups</span></div><div><strong>{stats.withTitle.toLocaleString()}</strong><span>With job titles</span></div></div>
        </section>
        <section className="search-panel" aria-label="People search and filters">
          <div className="search-row">
            <label className="search-box"><Icon name="search" size={21} /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search 20,000+ people, roles, keywords..." aria-label="Search people" />{query && <button onClick={() => { setQuery(""); resetPage(); }} aria-label="Clear search"><Icon name="close" size={16} /></button>}</label>
            <button className={`filter-toggle ${showFilters ? "open" : ""}`} onClick={() => setShowFilters(!showFilters)}><Icon name="sliders" />Filters {activeFilters > 0 && <b>{activeFilters}</b>}<span className="toggle-chevron"><Icon name="chevron" size={16} /></span></button>
          </div>
          <div className={`filter-drawer ${showFilters ? "show" : ""}`}>
            <label><span>Professional group</span><select value={department} onChange={(event) => { setDepartment(event.target.value); resetPage(); }}><option>All</option>{facets.departments.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
            <label><span>Time zone</span><select value={location} onChange={(event) => { setLocation(event.target.value); resetPage(); }}><option>All</option>{facets.locations.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
            <label><span>Slack status</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); resetPage(); }}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Profile details</span><select value={profile} onChange={(event) => { setProfile(event.target.value); resetPage(); }}>{profileOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button className="clear-button" onClick={clearFilters} disabled={!activeFilters && !query}>Clear all</button>
          </div>
          <div className="quick-filters" aria-label="Quick professional group filters">{quickDepartments.map((item) => <button key={item.value} className={department === item.value ? "active" : ""} onClick={() => { setDepartment(item.value); resetPage(); }}>{item.value === "All" ? "Everyone" : item.value}<small>{item.count.toLocaleString()}</small></button>)}</div>
        </section>
        <section className="directory-section" id="directory-results">
          <div className="results-toolbar"><div><h2>People directory</h2><p>{pagination.totalCount.toLocaleString()} {pagination.totalCount === 1 ? "person" : "people"} found {query !== deferredQuery && <span className="searching-label">· searching…</span>}</p></div><label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="department">Professional group</option><option value="title">Job title</option></select></label></div>
          {loading ? <LoadingGrid /> : error ? <div className="empty-state"><span><Icon name="users" size={28} /></span><h3>Could not load the directory</h3><p>{error}</p></div> : directoryPeople.length > 0 ? <div className="people-grid">{directoryPeople.map((person) => <ProfileCard key={person.id} person={person} onOpen={setSelectedPerson} />)}</div> : <div className="empty-state"><span><Icon name="users" size={28} /></span><h3>No people found</h3><p>Try a different name or loosen your filters.</p><button onClick={clearFilters}>Reset filters</button></div>}
          {!loading && !error && pagination.totalCount > 0 && <div className="pagination"><p>Showing <strong>{((pagination.page - 1) * pagination.perPage + 1).toLocaleString()}–{Math.min(pagination.page * pagination.perPage, pagination.totalCount).toLocaleString()}</strong> of {pagination.totalCount.toLocaleString()}</p><div><button className="page-arrow prev" onClick={() => goToPage(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1} aria-label="Previous page"><Icon name="chevron" /></button>{pageTokens(pagination.page, pagination.pageCount).map((token) => typeof token === "number" ? <button key={token} className={token === pagination.page ? "current" : ""} onClick={() => goToPage(token)} aria-label={`Page ${token}`}>{token}</button> : <span className="page-gap" key={token}>…</span>)}<button className="page-arrow" onClick={() => goToPage(Math.min(pagination.pageCount, pagination.page + 1))} disabled={pagination.page === pagination.pageCount} aria-label="Next page"><Icon name="chevron" /></button></div></div>}
        </section>
      </div>
      <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></div><p>{stats.total.toLocaleString()} Techqueria profiles available</p><span>{syncedAt ? `Synced ${new Date(syncedAt).toLocaleDateString()}` : "Directory not synced"}</span></footer>
      {selectedPerson && <ProfileModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </main>
  );
}
