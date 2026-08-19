import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // The canonical @supabase/ssr guard this file was missing. Next.js
          // forbids cookie writes during render ("Cookies can only be
          // modified in a Server Action or Route Handler") by THROWING —
          // so any auth call that touches cookies from a Server Component
          // was a 500, not a no-op. Found live: the dashboard layout's
          // suspended branch calls signOut(), whose GoTrue revocation
          // succeeded but whose cookie clear threw before the redirect
          // could run — a suspended session navigating /app rendered the
          // error boundary instead of "Your account is suspended." The
          // swallow is safe for exactly the reason the Supabase snippet
          // states: the proxy refreshes sessions, and a revoked session
          // fails getUser() everywhere regardless of stale cookies.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render — the write cannot
            // land, and nothing needs it to.
          }
        },
      },
    }
  )
}