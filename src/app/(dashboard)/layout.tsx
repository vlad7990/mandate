import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

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

  const { data: profile } = await supabase
    .from("users")
    .select("status, full_name, email, role")
    .eq("id", user.id)
    .single();

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
    <div className="bg-background text-on-background font-body-main h-screen flex overflow-hidden">
      <Sidebar
        user={{
          displayName,
          email,
          role: profile?.role ?? null,
        }}
      />
      <main className="flex-1 ml-20 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
