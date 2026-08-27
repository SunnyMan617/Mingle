import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { signInAction } from "../actions";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  return <AuthShell eyebrow="WELCOME BACK" title="Sign in to Mingle" description="Use your email address or username. Only approved accounts can access the people directory."><AuthForm mode="sign-in" action={signInAction} next={next} /></AuthShell>;
}
