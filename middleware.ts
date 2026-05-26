import { NextRequest, NextResponse } from "next/server";

// HTTP Basic auth gate for the whole dashboard. service_role gives full DB
// access, so the site must never be publicly reachable.
export function middleware(req: NextRequest) {
  const user = process.env.REVIEW_BASIC_USER;
  const pass = process.env.REVIEW_BASIC_PASS;

  // If credentials are not configured, fail closed (deny everything).
  if (!user || !pass) {
    return new NextResponse("Auth not configured", { status: 503 });
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    const gotUser = decoded.slice(0, idx);
    const gotPass = decoded.slice(idx + 1);
    if (gotUser === user && gotPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kurabe-ocr-review"' },
  });
}

export const config = {
  // Gate everything except Next internals/static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
