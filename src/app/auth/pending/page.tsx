import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getAuthContext } from "@/lib/auth";
import { signOutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const [{ user, profile }, { created }] = await Promise.all([getAuthContext(), searchParams]);
  const rejected = profile?.status === "rejected";
  return (
    <AuthShell
      eyebrow={rejected ? "ACCESS DECLINED" : "APPROVAL REQUIRED"}
      title={rejected ? "Your request was not approved" : "Your request is in review"}
      description={rejected ? "An administrator declined this access request. Contact the workspace administrator if you believe this is an error." : "Your account has been created, but the directory remains locked until an administrator approves it."}
    >
      <div className={`approval-state ${rejected ? "rejected" : ""}`}>
        <span>{rejected ? "×" : "✓"}</span>
        <div><strong>{rejected ? "Access unavailable" : created ? "Request received" : "Approval pending"}</strong><p>{user ? `Signed in as ${profile?.username || user.email}` : "Verify your email first if email confirmation is enabled, then sign in."}</p></div>
      </div>
      {user ? <div className="pending-actions"><Link href="/">Check approval status</Link><form action={signOutAction}><SignOutButton /></form></div> : <Link className="auth-submit auth-link-button" href="/auth/sign-in">Return to sign in</Link>}
    </AuthShell>
  );
}
