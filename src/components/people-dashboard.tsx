"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { Person, PersonStatus } from "@/data/people";
import { signOutAction } from "@/app/auth/actions";
import { SignOutButton } from "@/components/sign-out-button";

type IconName = "search" | "chevron" | "sliders" | "pin" | "briefcase" | "mail" | "phone" | "clock" | "calendar" | "arrow" | "close" | "users" | "sparkle" | "download" | "copy" | "check";
type Facet = { value: string; count: number };
type DirectoryResponse = {
  people: Person[];
  pagination: { page: number; perPage: number; pageCount: number; totalCount: number };
  facets: { departments: Facet[]; locations: Facet[]; regions: Facet[]; countries: Facet[] };
  stats: { total: number; withTitle: number; withStatus: number };
  source: "slack" | "demo";
  workspace: string;
  syncedAt: string;
  sentTrackingAvailable: boolean;
};
type LiveProfileResponse = {
  profile: {
    title: string; phone: string; skype: string; realName: string; displayName: string;
    firstName: string; lastName: string; email: string; statusText: string; statusEmoji: string;
    statusExpiration: number; imageOriginal: string;
  };
  details: Array<{ id: string; label: string; type: string; section: string; value: string; displayValue: string; url: string }>;
  sections: Array<{ label: string; count: number }>;
  extras: { onboardingComplete: boolean; channelCount: number; sharedChannelCount: number };
};
type PageToken = number | "left-gap" | "right-gap";

const PER_PAGE = 30;
const statusOptions: Array<"All" | PersonStatus> = ["All", "Available", "Away"];
const profileOptions = ["Has title", "Has email", "Has phone", "Has photo"];

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
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
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
        {person.isSent ? <span className="sent-badge"><Icon name="check" size={13} />Sent</span> : <span className={`status-label ${statusClass(person.status)}`}><i />{person.status === "Away" ? "Status set" : "Member"}</span>}
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

function ProfileDetailsLoading() {
  return (
    <div className="profile-details-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="details-loading-status">
        <span className="details-loading-mark"><Icon name="sparkle" size={16} /></span>
        <span><strong>Loading profile details</strong><small>Syncing the latest information from Slack</small></span>
        <i aria-hidden="true" />
      </div>
      <div className="profile-detail-grid details-skeleton-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="profile-detail detail-skeleton" key={index}>
            <div><span /><i /></div>
            <strong />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileDetailsEmpty({ unavailable }: { unavailable: boolean }) {
  return (
    <div className={`profile-details-empty${unavailable ? " unavailable" : ""}`} role={unavailable ? "alert" : undefined}>
      <span className="profile-details-empty-icon"><Icon name={unavailable ? "users" : "sparkle"} size={20} /></span>
      <div>
        <strong>{unavailable ? "Profile details unavailable" : "No additional details yet"}</strong>
        <p>{unavailable ? "We couldn’t load the latest Slack fields. Try opening this profile again in a moment." : "This member hasn’t added any custom fields to their Slack profile."}</p>
      </div>
    </div>
  );
}

function ProfileModal({ person, onClose, onSentChange, sentTrackingAvailable }: { person: Person; onClose: () => void; onSentChange: (personId: string, sent: boolean, sentAt?: string) => void; sentTrackingAvailable: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveDetails, setLiveDetails] = useState<LiveProfileResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState("");
  const [copiedFieldId, setCopiedFieldId] = useState("");
  const [pendingSent, setPendingSent] = useState<boolean | null>(null);
  const [sentSaving, setSentSaving] = useState(false);
  const [sentError, setSentError] = useState("");
  const customFields = liveDetails?.details || (person.customFields || []).map((field) => ({ ...field, section: "Additional information", displayValue: field.value, url: "" }));
  const profile = liveDetails?.profile;
  const displayedSent = pendingSent ?? Boolean(person.isSent);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/${person.id}`, { signal: controller.signal })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || `Profile request failed (${response.status})`);
        setLiveDetails(data as LiveProfileResponse); setDetailsError(""); setDetailsLoading(false);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") { setDetailsError(requestError.message); setDetailsLoading(false); }
      });
    return () => controller.abort();
  }, [person.id]);

  const copyDetail = async (fieldId: string, value: string) => {
    let copied = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }

    if (!copied) return;
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    setCopiedFieldId(fieldId);
    copyResetRef.current = setTimeout(() => setCopiedFieldId(""), 1800);
  };

  const updateSentStatus = async (sent: boolean) => {
    if (!sentTrackingAvailable || sentSaving) return;
    setPendingSent(sent);
    setSentSaving(true);
    setSentError("");

    try {
      const response = await fetch(`/api/sent-users/${encodeURIComponent(String(person.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sent }),
      });
      const data = await response.json() as { sent?: boolean; sentAt?: string | null; error?: string };
      if (!response.ok || typeof data.sent !== "boolean") throw new Error(data.error || "Unable to update sent status.");
      onSentChange(String(person.id), data.sent, data.sentAt || undefined);
    } catch (updateError) {
      setSentError(updateError instanceof Error ? updateError.message : "Unable to update sent status.");
    } finally {
      setPendingSent(null);
      setSentSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-name">
        <button className="modal-close" onClick={onClose} ref={closeRef} aria-label="Close profile"><Icon name="close" /></button>
        <div className="modal-hero">
          <div className="modal-avatar-wrap"><Image src={person.avatar} alt={`${person.name} profile`} width={176} height={176} className="modal-avatar" priority /><span className={`avatar-status ${statusClass(person.status)}`} /></div>
          <div className="modal-heading">
            <span className={`status-label ${statusClass(person.status)}`}><i />{person.status === "Away" ? "Slack status set" : "Workspace member"}</span>
            <h2 id="profile-name">{profile?.displayName || person.name}</h2><p>{profile?.title || person.title}</p>
            <div className="modal-identity">{person.username && <span>@{person.username}</span>}{(profile?.realName || person.realName) && (profile?.realName || person.realName) !== person.name && <span>{profile?.realName || person.realName}</span>}</div>
            <div className="modal-heading-actions">
              <span className="modal-department">{person.department}</span>
              <label className={`modal-sent-toggle${displayedSent ? " checked" : ""}${!sentTrackingAvailable ? " unavailable" : ""}`} title={!sentTrackingAvailable ? "Run the sent-users SQL migration to enable this feature" : displayedSent ? "Unmark this user as sent" : "Mark this user as sent"}>
                <input type="checkbox" checked={displayedSent} onChange={(event) => updateSentStatus(event.target.checked)} disabled={!sentTrackingAvailable || sentSaving} />
                <span className="sent-toggle-box">{displayedSent && <Icon name="check" size={13} />}</span>
                <span>{!sentTrackingAvailable ? "Sent tracking unavailable" : displayedSent ? "Marked sent" : "Mark sent"}</span>
                {sentSaving && <i aria-hidden="true" />}
              </label>
            </div>
            {sentError && <span className="sent-toggle-error" role="alert">{sentError}</span>}
          </div>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-summary-grid">
              <div className="modal-summary-card">
                <span className="eyebrow">About</span>
                {(profile?.statusText || person.statusText) && <div className="status-callout"><span>{profile?.statusEmoji || person.statusEmoji || "●"}</span>{profile?.statusText || person.statusText}</div>}
                <p className="bio">{person.bio}</p>
              </div>
              <div className="modal-summary-card">
                <span className="eyebrow">Profile keywords</span>
                <div className="modal-skills">{person.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              </div>
            </div>
            <div className="modal-section details-section">
              <div className="details-heading">
                <div><span className="eyebrow">All profile details</span><p>{detailsLoading ? "Syncing the latest information from Slack." : customFields.length > 0 ? "Use the copy button to quickly reuse any value." : detailsError ? "The latest Slack profile information could not be retrieved." : "Custom Slack profile fields will appear here."}</p></div>
                {!detailsLoading && customFields.length > 0 && <span className="detail-count">{customFields.length} {customFields.length === 1 ? "field" : "fields"}</span>}
              </div>
              {detailsLoading ? <ProfileDetailsLoading /> : customFields.length > 0 ? (
                <div className="profile-detail-grid">
                  {customFields.map((field) => {
                    const copied = copiedFieldId === field.id;
                    return (
                      <div className="profile-detail" key={field.id}>
                        <div className="profile-detail-head">
                          <small>{field.section} · {field.label}</small>
                          <button type="button" className={`copy-detail${copied ? " copied" : ""}`} onClick={() => copyDetail(field.id, field.displayValue)} aria-label={`${copied ? "Copied" : "Copy"} ${field.label}`} title={`Copy ${field.label}`}>
                            <Icon name={copied ? "check" : "copy"} size={14} /><span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                        {field.url ? <a href={field.url} target="_blank" rel="noreferrer">{field.displayValue}<Icon name="arrow" size={14} /></a> : <strong>{field.displayValue}</strong>}
                      </div>
                    );
                  })}
                </div>
              ) : <ProfileDetailsEmpty unavailable={Boolean(detailsError)} />}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LoadingGrid() {
  return <div className="people-grid" aria-busy="true"><span className="sr-only" role="status">Loading people</span>{Array.from({ length: 8 }, (_, index) => <div className="profile-card skeleton-card" aria-hidden="true" key={index}><span className="skeleton-line short" /><span className="skeleton-avatar" /><span className="skeleton-line name" /><span className="skeleton-line" /><span className="skeleton-line wide" /></div>)}</div>;
}

export function PeopleDashboard({ viewer }: { viewer: { username: string; role: "admin" | "user" } }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [department, setDepartment] = useState("All");
  const [location, setLocation] = useState("All");
  const [region, setRegion] = useState("All");
  const [country, setCountry] = useState("All");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [profileFilters, setProfileFilters] = useState<string[]>([]);
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [directoryPeople, setDirectoryPeople] = useState<Person[]>([]);
  const [pagination, setPagination] = useState({ page: 1, perPage: PER_PAGE, pageCount: 1, totalCount: 0 });
  const [facets, setFacets] = useState<{ departments: Facet[]; locations: Facet[]; regions: Facet[]; countries: Facet[] }>({ departments: [], locations: [], regions: [], countries: [] });
  const [stats, setStats] = useState({ total: 0, withTitle: 0, withStatus: 0 });
  const [source, setSource] = useState<"slack" | "demo">("slack");
  const [syncedAt, setSyncedAt] = useState("");
  const [sentTrackingAvailable, setSentTrackingAvailable] = useState(true);
  const [loadedRequest, setLoadedRequest] = useState("");
  const [error, setError] = useState("");
  const directoryRequest = new URLSearchParams({
    page: String(page), perPage: String(PER_PAGE), q: deferredQuery,
    department, location, region, country, status, profile: profileFilters.join(","), sort,
  }).toString();
  const loading = loadedRequest !== directoryRequest;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/people?${directoryRequest}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Directory request failed (${response.status})`);
        return response.json() as Promise<DirectoryResponse>;
      })
      .then((data) => {
        setDirectoryPeople(data.people); setPagination(data.pagination); setFacets(data.facets);
        setStats(data.stats); setSource(data.source); setSyncedAt(data.syncedAt); setSentTrackingAvailable(data.sentTrackingAvailable); setError(""); setLoadedRequest(directoryRequest);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") { setError(requestError.message); setLoadedRequest(directoryRequest); }
      });
    return () => controller.abort();
  }, [directoryRequest]);

  const activeFilters = [department, location, region, country, status].filter((value) => value !== "All").length + (profileFilters.length > 0 ? 1 : 0);
  const resetPage = () => setPage(1);
  const clearFilters = () => { setDepartment("All"); setLocation("All"); setRegion("All"); setCountry("All"); setStatus("All"); setProfileFilters([]); resetPage(); };
  const resetDirectory = () => { setQuery(""); clearFilters(); setSort("name-asc"); };
  const toggleProfileFilter = (value: string) => {
    setProfileFilters((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    resetPage();
  };
  const goToPage = (nextPage: number) => { setPage(nextPage); document.getElementById("directory-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const downloadCsv = () => {
    const params = new URLSearchParams({
      q: deferredQuery, department, location, region, country, status,
      profile: profileFilters.join(","), sort, format: "csv",
    });
    const link = document.createElement("a");
    link.href = `/api/people?${params}`;
    link.download = `techqueria-people-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const updatePersonSentStatus = (personId: string, sent: boolean, sentAt?: string) => {
    const update = (person: Person) => String(person.id) === personId ? { ...person, isSent: sent, sentAt: sent ? sentAt : undefined } : person;
    setDirectoryPeople((current) => current.map(update));
    setSelectedPerson((current) => current ? update(current) : current);
  };
  const quickDepartments = [{ value: "All", count: stats.total }, ...facets.departments.slice(0, 6)];

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Mingle home"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></a>
        <div className="topbar-actions">
          <span className={`live-source ${source}`}><i />{source === "slack" ? "Slack synced" : "Demo data"}</span>
          <details className="account-menu">
            <summary aria-label={`Open account menu for ${viewer.username}`}>
              <span className="account-avatar">{viewer.username.slice(0, 1).toUpperCase()}</span>
              <span className="account-copy"><strong>{viewer.username}</strong><small>{viewer.role === "admin" ? "Administrator" : "Member"}</small></span>
              <Icon name="chevron" size={14} />
            </summary>
            <div className="account-popover">
              <div className="account-popover-head"><small>Signed in as</small><strong>@{viewer.username}</strong></div>
              {viewer.role === "admin" && <a href="/admin"><Icon name="users" size={16} /><span>Manage approvals</span></a>}
              <form action={signOutAction}><SignOutButton compact /></form>
            </div>
          </details>
        </div>
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
            <div className="filter-drawer-head">
              <div><strong>Filter directory</strong><span>{activeFilters > 0 ? `${activeFilters} active ${activeFilters === 1 ? "filter" : "filters"}` : "Choose one or more filters"}</span></div>
              <button className="clear-button" type="button" onClick={clearFilters} disabled={activeFilters === 0}><Icon name="close" size={15} />Clear filters</button>
            </div>
            <div className="filter-fields">
              <label><span>Professional group</span><select value={department} onChange={(event) => { setDepartment(event.target.value); resetPage(); }}><option>All</option>{facets.departments.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
              <label><span>Region</span><select value={region} onChange={(event) => { setRegion(event.target.value); setCountry("All"); resetPage(); }}><option>All</option>{facets.regions.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
              <label><span>Country</span><select value={country} onChange={(event) => { setCountry(event.target.value); resetPage(); }}><option>All</option>{facets.countries.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
              <label><span>Time zone</span><select value={location} onChange={(event) => { setLocation(event.target.value); resetPage(); }}><option>All</option>{facets.locations.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count.toLocaleString()})</option>)}</select></label>
              <label><span>Slack status</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); resetPage(); }}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <div className="profile-filter"><span>Profile details</span><details className="profile-multiselect"><summary><span>{profileFilters.length === 0 ? "All profiles" : profileFilters.length === 1 ? profileFilters[0] : `${profileFilters.length} selected`}</span><Icon name="chevron" size={15} /></summary><div className="profile-options"><label><input type="checkbox" checked={profileFilters.length === 0} onChange={() => { setProfileFilters([]); resetPage(); }} /><span>All</span></label>{profileOptions.map((item) => <label key={item}><input type="checkbox" checked={profileFilters.includes(item)} onChange={() => toggleProfileFilter(item)} /><span>{item}</span></label>)}</div></details></div>
            </div>
          </div>
          <div className="quick-filters" aria-label="Quick professional group filters">{quickDepartments.map((item) => <button key={item.value} className={department === item.value ? "active" : ""} onClick={() => { setDepartment(item.value); resetPage(); }}>{item.value === "All" ? "Everyone" : item.value}<small>{item.count.toLocaleString()}</small></button>)}</div>
        </section>
        <section className="directory-section" id="directory-results">
          <div className="results-toolbar"><div><h2>People directory</h2><p>{pagination.totalCount.toLocaleString()} {pagination.totalCount === 1 ? "person" : "people"} found {query !== deferredQuery && <span className="searching-label">· searching…</span>}</p></div><div className="results-actions"><button className="download-button" type="button" onClick={downloadCsv} disabled={loading || Boolean(error) || pagination.totalCount === 0}><Icon name="download" size={16} /><span>Download CSV</span></button><label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="department">Professional group</option><option value="title">Job title</option></select></label></div></div>
          {loading ? <LoadingGrid /> : error ? <div className="empty-state"><span><Icon name="users" size={28} /></span><h3>Could not load the directory</h3><p>{error}</p></div> : directoryPeople.length > 0 ? <div className="people-grid">{directoryPeople.map((person) => <ProfileCard key={person.id} person={person} onOpen={setSelectedPerson} />)}</div> : <div className="empty-state"><span><Icon name="users" size={28} /></span><h3>No people found</h3><p>Try a different name or loosen your filters.</p><button onClick={resetDirectory}>Reset search and filters</button></div>}
          {!loading && !error && pagination.totalCount > 0 && <div className="pagination"><p>Showing <strong>{((pagination.page - 1) * pagination.perPage + 1).toLocaleString()}–{Math.min(pagination.page * pagination.perPage, pagination.totalCount).toLocaleString()}</strong> of {pagination.totalCount.toLocaleString()}</p><div><button className="page-arrow prev" onClick={() => goToPage(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1} aria-label="Previous page"><Icon name="chevron" /></button>{pageTokens(pagination.page, pagination.pageCount).map((token) => typeof token === "number" ? <button key={token} className={token === pagination.page ? "current" : ""} onClick={() => goToPage(token)} aria-label={`Page ${token}`}>{token}</button> : <span className="page-gap" key={token}>…</span>)}<button className="page-arrow" onClick={() => goToPage(Math.min(pagination.pageCount, pagination.page + 1))} disabled={pagination.page === pagination.pageCount} aria-label="Next page"><Icon name="chevron" /></button></div></div>}
        </section>
      </div>
      <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></div><p>{stats.total.toLocaleString()} Techqueria profiles available</p><span>{syncedAt ? `Synced ${new Date(syncedAt).toLocaleDateString()}` : "Directory not synced"}</span></footer>
      {selectedPerson && <ProfileModal person={selectedPerson} onClose={() => setSelectedPerson(null)} onSentChange={updatePersonSentStatus} sentTrackingAvailable={sentTrackingAvailable} />}
    </main>
  );
}
