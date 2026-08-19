import { redirect } from "next/navigation";

/**
 * The waitlist moved to the operator's house (/ops/waitlist, D3 of the
 * final-personas programme). This stub keeps the founder's old bookmark
 * working; anyone without platform:operate is turned away by name at
 * the /ops proxy gate.
 */
export default function WaitlistMovedPage() {
  redirect("/ops/waitlist");
}
