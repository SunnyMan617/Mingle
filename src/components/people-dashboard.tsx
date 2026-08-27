"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { people, Person, PersonStatus, WorkMode } from "@/data/people";

type IconName = "search" | "chevron" | "sliders" | "pin" | "briefcase" | "mail" | "phone" | "clock" | "calendar" | "arrow" | "close" | "users" | "sparkle";

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

const PAGE_SIZE = 9;
const statusOptions: Array<"All" | PersonStatus> = ["All", "Available", "In a meeting", "Away"];
const workOptions: Array<"All" | WorkMode> = ["All", "Remote", "Hybrid", "Office"];
const departments = ["All", ...Array.from(new Set(people.map((person) => person.department)))];
const locations = ["All", ...Array.from(new Set(people.map((person) => person.location)))];

function statusClass(status: PersonStatus) {
  if (status === "Available") return "is-available";
  if (status === "In a meeting") return "is-busy";
  return "is-away";
}

function ProfileCard({ person, onOpen }: { person: Person; onOpen: (person: Person) => void }) {
  return (
    <button className="profile-card" onClick={() => onOpen(person)} aria-label={`View ${person.name}'s profile`}>
      <div className="card-topline">
        <span className="department-pill">{person.department}</span>
        <span className={`status-label ${statusClass(person.status)}`}><i />{person.status}</span>
      </div>
      <div className="avatar-wrap">
        <Image className="avatar" src={person.avatar} alt={`${person.name} profile`} width={144} height={144} />
        <span className={`avatar-status ${statusClass(person.status)}`} />
      </div>
      <h3>{person.name}</h3>
      <p className="job-title">{person.title}</p>
      <div className="card-meta">
        <span><Icon name="pin" size={15} />{person.location}</span>
        <span><Icon name="briefcase" size={15} />{person.workMode}</span>
      </div>
      <div className="skill-row">
        {person.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
        {person.skills.length > 3 && <span>+{person.skills.length - 3}</span>}
      </div>
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
          <div className="modal-avatar-wrap">
            <Image src={person.avatar} alt={`${person.name} profile`} width={176} height={176} className="modal-avatar" priority />
            <span className={`avatar-status ${statusClass(person.status)}`} />
          </div>
          <div className="modal-heading">
            <span className={`status-label ${statusClass(person.status)}`}><i />{person.status}</span>
            <h2 id="profile-name">{person.name}</h2>
            <p>{person.title}</p>
            <span className="modal-department">{person.department}</span>
          </div>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-section"><span className="eyebrow">About</span><p className="bio">{person.bio}</p></div>
            <div className="modal-section"><span className="eyebrow">Skills & expertise</span><div className="modal-skills">{person.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
            <div className="modal-section"><span className="eyebrow">Current projects</span><div className="project-list">{person.projects.map((project, index) => <div key={project}><span>{String(index + 1).padStart(2, "0")}</span>{project}</div>)}</div></div>
          </div>
          <aside className="contact-panel">
            <span className="eyebrow">Contact & details</span>
            <a href={`mailto:${person.email}`}><span className="contact-icon"><Icon name="mail" /></span><span><small>Email</small>{person.email}</span></a>
            <a href={`tel:${person.phone}`}><span className="contact-icon"><Icon name="phone" /></span><span><small>Phone</small>{person.phone}</span></a>
            <div><span className="contact-icon"><Icon name="pin" /></span><span><small>Location</small>{person.location}</span></div>
            <div><span className="contact-icon"><Icon name="clock" /></span><span><small>Local time</small>{person.localTime}<em>{person.timezone}</em></span></div>
            <div><span className="contact-icon"><Icon name="calendar" /></span><span><small>Joined Mingle</small>{person.joined}</span></div>
            <button className="message-button"><Icon name="mail" size={17} />Send a message</button>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function PeopleDashboard() {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const [location, setLocation] = useState("All");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [workMode, setWorkMode] = useState<(typeof workOptions)[number]>("All");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filteredPeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = people.filter((person) => {
      const searchable = [person.name, person.title, person.department, person.location, ...person.skills].join(" ").toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (department === "All" || person.department === department)
        && (location === "All" || person.location === location)
        && (status === "All" || person.status === status)
        && (workMode === "All" || person.workMode === workMode);
    });
    return result.sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "department") return a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
      if (sort === "recent") return b.id - a.id;
      return a.name.localeCompare(b.name);
    });
  }, [query, department, location, status, workMode, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredPeople.length / PAGE_SIZE));
  const visiblePeople = filteredPeople.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = [department, location, status, workMode].filter((value) => value !== "All").length;
  const clearFilters = () => { setQuery(""); setDepartment("All"); setLocation("All"); setStatus("All"); setWorkMode("All"); setSort("name-asc"); setPage(1); };

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Mingle home"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></a>
        <nav aria-label="Main navigation"><a className="active" href="#directory">Directory</a><a href="#teams">Teams</a><a href="#org">Org chart</a></nav>
        <div className="topbar-actions"><button className="invite-button">+ Invite people</button><Image src={people[4].avatar} alt="Your profile" width={40} height={40} className="nav-avatar" /></div>
      </header>
      <div className="page-wrap" id="top">
        <section className="hero" id="directory">
          <div><span className="kicker"><Icon name="sparkle" size={15} /> Your people, one place</span><h1>Find the person<br />who can <em>help.</em></h1><p>Search across your team by name, role, skill, or location.</p></div>
          <div className="hero-stats" aria-label="Directory summary"><div><strong>{people.length}</strong><span>People</span></div><div><strong>{departments.length - 1}</strong><span>Teams</span></div><div><strong>{people.filter((person) => person.status === "Available").length}</strong><span>Available now</span></div></div>
        </section>
        <section className="search-panel" aria-label="People search and filters">
          <div className="search-row">
            <label className="search-box"><Icon name="search" size={21} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search people, roles, skills..." aria-label="Search people" />{query && <button onClick={() => { setQuery(""); setPage(1); }} aria-label="Clear search"><Icon name="close" size={16} /></button>}</label>
            <button className={`filter-toggle ${showFilters ? "open" : ""}`} onClick={() => setShowFilters(!showFilters)}><Icon name="sliders" />Filters {activeFilters > 0 && <b>{activeFilters}</b>}<span className="toggle-chevron"><Icon name="chevron" size={16} /></span></button>
          </div>
          <div className={`filter-drawer ${showFilters ? "show" : ""}`}>
            <label><span>Department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Location</span><select value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }}>{locations.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Work style</span><select value={workMode} onChange={(event) => { setWorkMode(event.target.value as typeof workMode); setPage(1); }}>{workOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button className="clear-button" onClick={clearFilters} disabled={!activeFilters && !query}>Clear all</button>
          </div>
          <div className="quick-filters" aria-label="Quick department filters">{departments.map((item) => <button key={item} className={department === item ? "active" : ""} onClick={() => { setDepartment(item); setPage(1); }}>{item === "All" ? "Everyone" : item}</button>)}</div>
        </section>
        <section className="directory-section">
          <div className="results-toolbar"><div><h2>People directory</h2><p>{filteredPeople.length} {filteredPeople.length === 1 ? "person" : "people"} found</p></div><label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="department">Department</option><option value="recent">Recently added</option></select></label></div>
          {visiblePeople.length > 0 ? <div className="people-grid">{visiblePeople.map((person) => <ProfileCard key={person.id} person={person} onOpen={setSelectedPerson} />)}</div> : <div className="empty-state"><span><Icon name="users" size={28} /></span><h3>No people found</h3><p>Try a different name or loosen your filters.</p><button onClick={clearFilters}>Reset filters</button></div>}
          {filteredPeople.length > 0 && <div className="pagination"><p>Showing <strong>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredPeople.length)}</strong> of {filteredPeople.length}</p><div><button className="page-arrow prev" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous page"><Icon name="chevron" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} className={pageNumber === page ? "current" : ""} onClick={() => setPage(pageNumber)} aria-label={`Page ${pageNumber}`}>{pageNumber}</button>)}<button className="page-arrow" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} aria-label="Next page"><Icon name="chevron" /></button></div></div>}
        </section>
      </div>
      <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></div><p>Built for teams that work better together.</p><span>Directory updated today</span></footer>
      {selectedPerson && <ProfileModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </main>
  );
}
