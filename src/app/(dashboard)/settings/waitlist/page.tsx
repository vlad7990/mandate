import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { WaitlistTable, type WaitlistRow } from "./waitlist-table";

export const metadata = {
  title: "Waitlist · Mandate",
};

export default async function WaitlistPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("users")
    .select("is_founder, status")
    .eq("id", user.id)
    .single<{ is_founder: boolean; status: string }>();

  if (!profile?.is_founder || profile.status !== "active") {
    // Don't expose the route to non-founders — render 404 rather than
    // a 403, since the waitlist's existence is itself privileged
    // information.
    notFound();
  }

  const { data: rows, error } = await supabase
    .from("waitlist")
    .select(
      "id, full_name, email, company, role, referral_source, use_case, status, notes, reviewed_by, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load waitlist: ${error.message}`);
  }

  const list = (rows ?? []) as WaitlistRow[];
  const counts = {
    pending: list.filter((r) => r.status === "pending").length,
    approved: list.filter((r) => r.status === "approved").length,
    rejected: list.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <BreadcrumbRail
        segments={[
          { label: "Mandate", href: "/home" },
          { label: "Settings", href: "/settings" },
          { label: "Waitlist" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            ACCESS_REQUESTS
          </h1>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums flex items-center gap-3 flex-wrap">
            <span>
              <span className="text-primary">
                {String(counts.pending).padStart(2, "0")}
              </span>{" "}
              pending
            </span>
            <span className="text-outline-variant">·</span>
            <span>
              <span className="text-secondary-fixed-dim">
                {String(counts.approved).padStart(2, "0")}
              </span>{" "}
              approved
            </span>
            <span className="text-outline-variant">·</span>
            <span>
              <span className="text-error">
                {String(counts.rejected).padStart(2, "0")}
              </span>{" "}
              rejected
            </span>
          </p>
        </div>
      </header>

      <WaitlistTable rows={list} />
    </div>
  );
}
