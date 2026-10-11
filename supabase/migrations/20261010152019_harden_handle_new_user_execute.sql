-- Phase 8A.4 draft: requires explicit approval before remote application.
-- Keep the existing Auth signup trigger, function owner, SECURITY DEFINER,
-- and empty search_path unchanged. Remove only direct client execution.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
