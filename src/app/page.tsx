import { PeopleDashboard } from "@/components/people-dashboard";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/auth/sign-in");
  if (!profile || profile.status !== "approved") redirect("/auth/pending");
  return <PeopleDashboard viewer={{ username: profile.username, role: profile.role }} initialSearch={await searchParams} />;
}
