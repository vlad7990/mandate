import * as React from "react";
import { hasCapability } from "@/lib/auth/access";
import { type Capability } from "@/lib/auth/roles";

/**
 * Renders `children` only if the caller holds `capability`.
 *
 * For write affordances — "New mandate", "Add candidate", "New skill" — not
 * for anything that matters. The route guard and RLS decide what actually
 * happens; this decides whether the product offers it.
 *
 * That distinction is why the default fallback is `null` rather than a
 * disabled control. A disabled button is a promise the product cannot keep:
 * it says "this is yours, just not right now", when the truth is that it
 * belongs to a different role. The Topbar already carries a note about
 * exactly this — three permanently-dead controls were removed from it for
 * the same reason. Where the absence would be confusing, pass a `fallback`
 * that explains it.
 *
 * A server component, so the decision happens before the markup is sent and
 * a hidden control is genuinely absent rather than merely unstyled.
 * `getAccess` is request-cached, so several gates on one page cost one read.
 */
export async function CapabilityGate({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const allowed = await hasCapability(capability);
  return <>{allowed ? children : fallback}</>;
}
