"use client";

import { useFormStatus } from "react-dom";

export function ApprovalSubmitButton({ className = "", idleLabel, pendingLabel }: { className?: string; idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? pendingLabel : idleLabel}</button>;
}
