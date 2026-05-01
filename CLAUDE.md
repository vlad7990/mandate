@AGENTS.md

## PRE-LAUNCH CHECKLIST

### Security & Performance
- [ ] Run Supabase advisor sweep (mcp_supabase_get_advisors) and fix any new findings before public launch
- [ ] Add hCaptcha/Turnstile to /request-access form
- [ ] Rotate Supabase service role key (was exposed in terminal)
- [ ] Review all RLS policies on pre-existing tables
- [ ] Fix unindexed FK warnings on older migrations

### Before First Client
- [ ] Test full search loop with 8-10 real candidate CVs
- [ ] Verify HM portal works end-to-end with real hiring manager
- [ ] Test Triangulation Report with real data
- [ ] Verify all PDF exports work correctly
- [ ] Test email drafts open correctly in mail client

### Before Public Launch
- [ ] Set up Stripe billing
- [ ] Set up Resend for transactional emails
- [ ] Add rate limiting to /request-access
- [ ] Add error monitoring (Sentry or similar)
- [ ] Write onboarding documentation
- [ ] Set up status page
- [ ] Run Lighthouse audit on / marketing page and fix any LCP/CLS issues from animations before public launch
- [ ] Test all landing page animations on mobile devices
- [ ] Verify simulator works correctly in production (rate limiting, API responses)
