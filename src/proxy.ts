import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth } from "@/lib/basicAuth";

/**
 * Optional password gate for the whole site. Set SITE_PASSWORD to turn it on (for example while the site is being
 * reviewed); leave it unset to make the site public. Any user name works; the browser shows its own login prompt.
 */
export function proxy(request: NextRequest) {
  if (checkBasicAuth(request.headers.get("authorization"), process.env.SITE_PASSWORD)) return NextResponse.next();
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Residential Tax Appeal (preview)", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
