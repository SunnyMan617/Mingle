import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { signUpAction } from "../actions";

export default function SignUpPage() {
  return <AuthShell eyebrow="REQUEST ACCESS" title="Create your account" description="Register once, then an administrator will review and approve your access."><AuthForm mode="sign-up" action={signUpAction} /></AuthShell>;
}
