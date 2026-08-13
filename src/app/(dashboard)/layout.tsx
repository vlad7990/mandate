import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BreadcrumbProvider } from "@/components/dashboard/breadcrumbs";
import { Toaster } from "@/components/ui/sonner";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { countNetworkPeople } from "@/lib/network/network-aggregator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  // The profile read and the two rail badges are independent, so they run
  // together rather than as three serial round trips on every single page
  // load. The status gate below still runs before anything renders — the
  // badge queries are org-scoped by RLS, so a pending user (no org) reads
  // nothing from them anyway, and a redirect simply discards the results.
  const [{ data: profile }, networkCount, { count: mandateCount }] =
    await Promise.all([
      supabase
        .from("users")
        .select("status, full_name, email, role")
        .eq("id", user.id)
        .single(),
      // Distinct people in the org's candidate pool, matching the Network
      // page's own dedupe. Counted in Postgres — see the aggregator.
      countNetworkPeople(),
      // Head-only: a count, no rows.
      supabase.from("projects").select("id", { count: "exact", head: true }),
    ]);

  if (profile?.status === "pending") {
    redirect("/auth/pending");
  }

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    redirect(
      `/auth/signin?error=${encodeURIComponent("Your account is suspended.")}`
    );
  }

  const displayName = profile?.full_name?.trim() || profile?.email || user.email || "Operator";
  const email = profile?.email || user.email || "";

  return (
    <BreadcrumbProvider>
      {/*
        `print:` overrides throughout: the shell is chrome, not document.
        The Executive Intelligence report prints as itself, and a
        `h-screen overflow-hidden` shell would otherwise clip it to a
        single page. `display: contents` wrappers keep the flex layout
        identical on screen while giving print something to hide.
      */}
      <div className="flex h-screen overflow-hidden bg-background font-body-main text-on-background print:block print:h-auto print:overflow-visible">
        <div className="contents print:hidden">
          <Sidebar
            user={{
              displayName,
              email,
              role: profile?.role ?? null,
            }}
            badges={{ network: networkCount, mandates: mandateCount ?? 0 }}
          />
        </div>

        {/*
          `min-w-0` matters: without it a wide table inside the content
          region sets the flex item's min-content width and pushes the
          rail off-screen instead of scrolling inside its own container.

          The old markup was `flex-1 ml-20` — a hardcoded margin
          clearing a fixed 80px rail. The rail is now 0px, 64px or
          240px depending on viewport, so a fixed margin would be wrong
          at two of the three sizes. The shell is flex; nothing needs to
          know the rail's width.
        */}
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
          <div className="contents print:hidden">
            <Topbar />
          </div>
          <div className="flex-1 overflow-auto print:overflow-visible">{children}</div>
        </main>

        <div className="contents print:hidden">
          <Toaster richColors position="top-right" />
          <CopilotPanel />
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
