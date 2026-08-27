"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/auth/actions";

type Props = {
  mode: "sign-in" | "sign-up";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
};

export function AuthForm({ mode, action, next = "" }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const signIn = mode === "sign-in";

  return (
    <form action={formAction} className="auth-form">
      {next && <input type="hidden" name="next" value={next} />}
      {!signIn && (
        <label><span>Username</span><input name="username" type="text" autoComplete="username" placeholder="your-username" minLength={3} maxLength={30} required /></label>
      )}
      <label>
        <span>{signIn ? "Email or username" : "Email address"}</span>
        <input name={signIn ? "identifier" : "email"} type={signIn ? "text" : "email"} autoComplete={signIn ? "username" : "email"} placeholder={signIn ? "you@example.com or username" : "you@example.com"} required />
      </label>
      <label><span>Password</span><input name="password" type="password" autoComplete={signIn ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength={8} required /></label>
      {!signIn && <label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your password" minLength={8} required /></label>}
      {state?.error && <div className="auth-error" role="alert">{state.error}</div>}
      <button className="auth-submit" disabled={pending} type="submit">
        {pending && <i aria-hidden="true" />} {pending ? (signIn ? "Signing in…" : "Creating account…") : (signIn ? "Sign in" : "Request access")}
      </button>
      <p className="auth-switch">
        {signIn ? "Need an account?" : "Already registered?"} <Link href={signIn ? "/auth/sign-up" : "/auth/sign-in"}>{signIn ? "Request access" : "Sign in"}</Link>
      </p>
    </form>
  );
}
