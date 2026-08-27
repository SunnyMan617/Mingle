import Link from "next/link";
import { redirect } from "next/navigation";
import { ApprovalSubmitButton } from "@/components/approval-submit-button";
import { SignOutButton } from "@/components/sign-out-button";
import { signOutAction } from "@/app/auth/actions";
import { requireAdmin, type AppProfile, type ApprovalStatus } from "@/lib/auth";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { updateApprovalAction } from "./actions";

export const dynamic = "force-dynamic";

const filters: Array<{ value: "all" | ApprovalStatus; label: string }> = [
  { value: "all", label: "All users" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const auth = await requireAdmin();
  if (!auth) redirect("/");
  const rawStatus = (await searchParams).status || "pending";
  const status = filters.some((item) => item.value === rawStatus) ? rawStatus : "pending";
  const admin = createAuthAdminClient();
  const { data, error } = await admin.from("app_profiles").select("id,email,username,role,status,created_at,approved_at,approved_by").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const profiles = (data ?? []) as AppProfile[];
  const visible = status === "all" ? profiles : profiles.filter((profile) => profile.status === status);
  const counts = Object.fromEntries(["pending", "approved", "rejected"].map((key) => [key, profiles.filter((profile) => profile.status === key).length]));

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>Mingle</span></Link>
        <div><Link href="/">Back to directory</Link><form action={signOutAction}><SignOutButton compact /></form></div>
      </header>
      <div className="admin-wrap">
        <section className="admin-intro"><div><span>ADMIN CONTROL CENTER</span><h1>Access approvals</h1><p>Review registration requests and control who can open the people directory.</p></div><div className="admin-summary"><span><strong>{counts.pending}</strong>Waiting</span><span><strong>{counts.approved}</strong>Approved</span><span><strong>{counts.rejected}</strong>Rejected</span></div></section>
        <nav className="admin-filters" aria-label="Approval status">{filters.map((filter) => <Link className={status === filter.value ? "active" : ""} href={filter.value === "pending" ? "/admin" : `/admin?status=${filter.value}`} key={filter.value}>{filter.label}{filter.value !== "all" && <small>{counts[filter.value]}</small>}</Link>)}</nav>
        <section className="approval-list">
          {visible.length ? visible.map((profile) => <article className="approval-card" key={profile.id}>
            <span className="approval-avatar">{profile.username.slice(0, 1).toUpperCase()}</span>
            <div className="approval-identity"><strong>{profile.username}</strong><p>{profile.email}</p><small>Registered {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(profile.created_at))}</small></div>
            <span className={`approval-badge ${profile.status}`}>{profile.status}</span>
            <div className="approval-actions">{profile.role === "admin" ? <span className="protected-admin">Administrator</span> : <>
              {profile.status !== "approved" && <form action={updateApprovalAction}><input name="id" type="hidden" value={profile.id} /><input name="status" type="hidden" value="approved" /><ApprovalSubmitButton className="approve" idleLabel="Approve" pendingLabel="Approving…" /></form>}
              {profile.status !== "rejected" && <form action={updateApprovalAction}><input name="id" type="hidden" value={profile.id} /><input name="status" type="hidden" value="rejected" /><ApprovalSubmitButton className="reject" idleLabel="Reject" pendingLabel="Rejecting…" /></form>}
              {profile.status !== "pending" && <form action={updateApprovalAction}><input name="id" type="hidden" value={profile.id} /><input name="status" type="hidden" value="pending" /><ApprovalSubmitButton idleLabel="Reset" pendingLabel="Resetting…" /></form>}
            </>}</div>
          </article>) : <div className="admin-empty"><span>✓</span><h2>No {status === "all" ? "users" : `${status} requests`}</h2><p>There is nothing to review in this group.</p></div>}
        </section>
      </div>
    </main>
  );
}
