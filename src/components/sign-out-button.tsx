"use client";

import { useFormStatus } from "react-dom";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={compact ? "account-signout" : "pending-signout"} type="submit" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>;
}
