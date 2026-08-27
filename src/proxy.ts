import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/auth/sign-in", "/auth/sign-up", "/auth/pending"];

function publicConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.AUTH_SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.AUTH_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY,
  };
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = publicConfig();
  if (!url || !key) {
    return new NextResponse("Authentication is not configured.", { status: 503 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user) {
    if (isPublic) return response;
    if (isApi) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/auth/sign-in";
    signIn.search = "";
    if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }

  const { data: profile } = await supabase
    .from("app_profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (pathname === "/auth/pending") {
    return profile?.status === "approved" ? NextResponse.redirect(new URL("/", request.url)) : response;
  }
  if (pathname === "/auth/sign-in" || pathname === "/auth/sign-up") {
    return NextResponse.redirect(new URL(profile?.status === "approved" ? "/" : "/auth/pending", request.url));
  }
  if (!profile || profile.status !== "approved") {
    return isApi
      ? NextResponse.json({ error: "Your account is awaiting approval." }, { status: 403 })
      : NextResponse.redirect(new URL("/auth/pending", request.url));
  }
  if (pathname.startsWith("/admin") && profile.role !== "admin") {
    return isApi
      ? NextResponse.json({ error: "Administrator access required." }, { status: 403 })
      : NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
