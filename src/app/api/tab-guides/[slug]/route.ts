import { NextResponse } from "next/server";
import { loadTabGuide } from "@/lib/tab-guides/server";

/**
 * One tab guide, parsed (§198).
 *
 * Fetched by the help panel the first time a reader opens it, rather
 * than shipped with every dashboard page: nineteen guides in the layout
 * payload would be ~30 KB of markdown riding every navigation to pay for
 * a panel most visits never open.
 *
 * Not public-by-accident and not secret either — D5 publishes the same
 * words at /handbook. It carries no session data, so it is cacheable;
 * the guides only change when the repo does.
 *
 * Path traversal is closed in `loadTabGuide`, which tests the slug
 * against the nav-derived list before it builds a path.
 */

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const guide = loadTabGuide(slug);
  if (!guide) {
    return NextResponse.json({ error: "No guide for that tab." }, { status: 404 });
  }
  return NextResponse.json(guide, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
