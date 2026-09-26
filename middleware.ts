import { NextResponse, type NextRequest } from "next/server";

// Basic auth for the whole console once CONSOLE_PASSWORD is set. /support holds
// user messages + a reply action, so it fails closed when the password is
// missing; the OCR pages keep their old (open) behaviour until it is set.
export function middleware(req: NextRequest) {
  const password = process.env.CONSOLE_PASSWORD;
  if (!password) {
    return req.nextUrl.pathname.startsWith("/support")
      ? new NextResponse("Set CONSOLE_PASSWORD to enable /support", { status: 503 })
      : NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const pass = atob(encoded).split(":").slice(1).join(":");
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kurabe-console"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
