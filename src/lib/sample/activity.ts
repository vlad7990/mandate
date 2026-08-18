import type { ActivityEventRow } from "@/lib/activity/types";
import { ACTIVITY_GROUP_OF } from "@/lib/activity/types";
import {
  SAMPLE_CLIENTS,
  SAMPLE_MANDATES,
  SAMPLE_PLACEMENTS,
  SAMPLE_VIEWER,
} from "./data";
import { SAMPLE_COMPARISON } from "./reports-analytics";

/**
 * The activity trail — genuinely the last thing in this programme, and the
 * reason is worth keeping.
 *
 * The trail is a **projection of the other entities**. Seeded before them
 * it reads as noise: a list of sentences about placements, fees, contacts
 * and members that a reader cannot click into and cannot check against
 * anything. Seeded after them it fills itself, because every row here
 * refers to something another sample screen already shows.
 *
 * ## Rows, not prose
 *
 * 053 keeps the *facts* in `detail` and derives the *sentence* in
 * `describe.ts`, so a phrase can improve without rewriting history and an
 * old row still reads under a new build. The sample honours that split
 * exactly: this file builds `ActivityEventRow` objects and the page runs
 * them through `describeActivity` — the same function the real feed uses.
 *
 * Which means the sample cannot word an event differently from the
 * product. It also means it cannot invent an event type: `event_type` is
 * `ActivityEventType`, so a row the vocabulary does not have fails the
 * build rather than rendering a made-up sentence.
 *
 * ## Visibility is real here, not decorative
 *
 * Each row carries the tier that may read it, and the page filters by the
 * reader's capabilities exactly as RLS would. A viewer sees the placement
 * and client rows and none of the money; an admin also sees the member
 * changes. The sample must not be more generous than the database — a
 * demo that shows everybody the fee history would teach the opposite of
 * what the product does, which is the same argument W2 made about the
 * client rate card.
 *
 * ## Two silences, carried on purpose
 *
 * `report_exported` and `hm_portal_opened` are in the vocabulary and are
 * never written (see `APP_RECORDABLE_EVENTS`). They are absent here too.
 * A sample that showed an event the product cannot produce would be
 * teaching a feature that does not exist.
 */

const ORG = "sample-org";

/** Days back → ISO. The fixture stores day counts; the page renders time. */
function isoDaysAgo(days: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

type SampleEventSeed = Omit<
  ActivityEventRow,
  "id" | "organization_id" | "created_at"
> & { daysAgo: number; hour?: number; minute?: number };

const LARKSPUR = SAMPLE_MANDATES.find((m) => m.id === "sample-larkspur");
const CINDERMERE = SAMPLE_MANDATES.find((m) => m.id === "sample-cindermere");
const LARKSPUR_CLIENT = SAMPLE_CLIENTS.find(
  (c) => c.id === "sample-client-larkspur"
);
const NORTHVALE_CLIENT = SAMPLE_CLIENTS.find(
  (c) => c.id === "sample-client-northvale"
);

const DEMIRCI = SAMPLE_PLACEMENTS.find((p) => p.id === "sample-placement-demirci");
const MBEKI = SAMPLE_PLACEMENTS.find((p) => p.id === "sample-placement-mbeki");
const VARGA = SAMPLE_PLACEMENTS.find((p) => p.id === "sample-placement-varga");

const RECRUITER = SAMPLE_VIEWER.displayName;

/**
 * The seeds, newest first.
 *
 * Every one of these refers to something another screen shows: the
 * Cindermere fallthrough and its reversal are the pair `/app/placements`
 * renders, the shortlist publication is the slate `/shortlist` submits,
 * and the contacts are rows on the client detail page.
 */
const SEEDS: readonly SampleEventSeed[] = [
  {
    daysAgo: 1,
    hour: 16,
    minute: 12,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "fee_line_earned",
    project_id: null,
    candidate_id: null,
    client_id: LARKSPUR_CLIENT?.id ?? null,
    placement_id: DEMIRCI?.id ?? null,
    target_user_id: null,
    detail: {
      label: "Start instalment",
      amount: 32_000,
      currency: "GBP",
      earned_on: "the start date",
    },
    visibility: "fees",
  },
  {
    daysAgo: 3,
    hour: 11,
    minute: 40,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "shortlist_published",
    project_id: LARKSPUR?.id ?? null,
    candidate_id: null,
    client_id: LARKSPUR_CLIENT?.id ?? null,
    placement_id: null,
    target_user_id: null,
    // Derived, so the sentence cannot claim a slate size the shortlist
    // screen does not show.
    detail: { count: SAMPLE_COMPARISON.primarySlate.length },
    visibility: "org",
  },
  {
    daysAgo: 6,
    hour: 15,
    minute: 5,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "fee_reversed",
    project_id: CINDERMERE?.id ?? null,
    candidate_id: null,
    client_id: "sample-client-cindermere",
    placement_id: MBEKI?.id ?? null,
    target_user_id: null,
    detail: {
      amount: MBEKI?.billed ?? -54_000,
      currency: "GBP",
      reason: "candidate withdrew inside the guarantee",
    },
    visibility: "fees",
  },
  {
    daysAgo: 6,
    hour: 14,
    minute: 58,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "placement_status_changed",
    project_id: CINDERMERE?.id ?? null,
    candidate_id: null,
    client_id: "sample-client-cindermere",
    placement_id: MBEKI?.id ?? null,
    target_user_id: null,
    detail: {
      from: "started",
      to: "fell_through",
      reason: "candidate withdrew inside the guarantee",
    },
    visibility: "org",
  },
  {
    daysAgo: 9,
    hour: 10,
    minute: 22,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "placement_recorded",
    project_id: CINDERMERE?.id ?? null,
    candidate_id: null,
    client_id: "sample-client-cindermere",
    placement_id: VARGA?.id ?? null,
    target_user_id: null,
    detail: { offer_date: "the 9th" },
    visibility: "org",
  },
  {
    daysAgo: 12,
    hour: 9,
    minute: 30,
    actor_id: null,
    actor_label: "Rosalind Akerman",
    event_type: "placement_signoff_changed",
    project_id: null,
    candidate_id: null,
    client_id: NORTHVALE_CLIENT?.id ?? null,
    placement_id: "sample-placement-akindele",
    target_user_id: null,
    detail: { to: "Rosalind Akerman" },
    visibility: "org",
  },
  {
    daysAgo: 18,
    hour: 13,
    minute: 47,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "client_contact_added",
    project_id: null,
    candidate_id: null,
    client_id: LARKSPUR_CLIENT?.id ?? null,
    placement_id: null,
    target_user_id: null,
    detail: {
      name: "Priya Raman",
      title: "Chief People Officer",
      is_primary: true,
    },
    visibility: "org",
  },
  {
    daysAgo: 24,
    hour: 8,
    minute: 15,
    actor_id: null,
    actor_label: "Elena Marchetti",
    event_type: "member_role_changed",
    project_id: null,
    candidate_id: null,
    client_id: null,
    placement_id: null,
    target_user_id: "sample-user-hollis",
    detail: { member: "Jonah Hollis", from: "viewer", to: "researcher" },
    visibility: "admin",
  },
  {
    daysAgo: 31,
    hour: 17,
    minute: 3,
    actor_id: null,
    actor_label: RECRUITER,
    event_type: "fee_terms_created",
    project_id: null,
    candidate_id: null,
    client_id: NORTHVALE_CLIENT?.id ?? null,
    placement_id: null,
    target_user_id: null,
    detail: { scope: "client", percentage: 27 },
    visibility: "fees",
  },
  {
    daysAgo: 38,
    hour: 12,
    minute: 0,
    actor_id: null,
    // Null actor: a change with no signed-in person behind it. Worth one
    // row, because the feed has to be able to say "System" honestly and a
    // reader should meet that once rather than wonder at it later.
    actor_label: null,
    event_type: "placement_status_changed",
    project_id: null,
    candidate_id: null,
    client_id: NORTHVALE_CLIENT?.id ?? null,
    placement_id: "sample-placement-akindele",
    target_user_id: null,
    detail: { from: "accepted", to: "started" },
    visibility: "org",
  },
];

/** The trail, as rows the real feed's own renderer can consume. */
export const SAMPLE_ACTIVITY: readonly ActivityEventRow[] = SEEDS.map(
  (s, i) => {
    const { daysAgo, hour, minute, ...row } = s;
    return {
      ...row,
      id: `sample-activity-${String(i + 1).padStart(2, "0")}`,
      organization_id: ORG,
      created_at: isoDaysAgo(daysAgo, hour, minute),
    };
  }
);

/**
 * The rows a given reader may see.
 *
 * Mirrors the RLS tiers rather than approximating them: `org` to everyone,
 * `fees` behind `fees:read`, `admin` behind `org:manage`. The page passes
 * its own capability answers in, so the sample cannot be more generous
 * than the database would be.
 */
export function sampleActivityFor({
  seesFees,
  seesMembers,
}: {
  seesFees: boolean;
  seesMembers: boolean;
}): ActivityEventRow[] {
  return SAMPLE_ACTIVITY.filter((r) => {
    if (r.visibility === "fees") return seesFees;
    if (r.visibility === "admin") return seesMembers;
    return true;
  });
}

/** Group counts for the filter row, derived from the rows themselves. */
export function sampleActivityGroups(rows: readonly ActivityEventRow[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const g = ACTIVITY_GROUP_OF[r.event_type];
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return counts;
}
