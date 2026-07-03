import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth";

// /api/cron bypasses the password gate because Vercel Cron has no session cookie —
// it authenticates itself with CRON_SECRET inside the route handler instead.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySessionCookieValue(cookie);

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip static assets, PWA files, and Next internals so the app shell and icons load pre-auth.
    "/((?!_next/static|_next/image|icons/|splash/|manifest.json|sw.js|favicon.ico).*)",
  ],
};
