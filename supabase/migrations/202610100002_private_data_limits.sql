-- NOT VALID preserves existing rows during migration while enforcing these
-- limits for rows inserted or updated after this migration is applied.
alter table public.resumes
  add constraint resumes_content_size_check
    check (pg_catalog.octet_length(content::text) <= 524288) not valid,
  add constraint resumes_original_content_size_check
    check (pg_catalog.octet_length(original_content::text) <= 524288) not valid;

alter table public.job_descriptions
  add constraint job_requirements_size_check
    check (pg_catalog.octet_length(reviewed_requirements::text) <= 262144) not valid;

alter table public.match_analyses
  add constraint match_results_size_check
    check (pg_catalog.octet_length(deterministic_results::text) <= 524288) not valid,
  add constraint match_ai_context_size_check
    check (ai_contextual_analysis is null or pg_catalog.octet_length(ai_contextual_analysis::text) <= 262144) not valid;

create function public.enforce_user_data_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_records bigint;
  total_bytes bigint;
begin
  perform id from public.profiles where id = new.user_id for update;
  if not found then raise exception using errcode = '23514', message = 'Account profile is unavailable'; end if;

  select
    (select count(*) from public.resumes where user_id = new.user_id)
      + (select count(*) from public.job_descriptions where user_id = new.user_id)
      + (select count(*) from public.match_analyses where user_id = new.user_id)
      + (select count(*) from public.job_applications where user_id = new.user_id),
    (select coalesce(sum(pg_catalog.octet_length(pg_catalog.to_jsonb(r)::text)), 0) from public.resumes r where user_id = new.user_id)
      + (select coalesce(sum(pg_catalog.octet_length(pg_catalog.to_jsonb(j)::text)), 0) from public.job_descriptions j where user_id = new.user_id)
      + (select coalesce(sum(pg_catalog.octet_length(pg_catalog.to_jsonb(m)::text)), 0) from public.match_analyses m where user_id = new.user_id)
      + (select coalesce(sum(pg_catalog.octet_length(pg_catalog.to_jsonb(a)::text)), 0) from public.job_applications a where user_id = new.user_id)
  into total_records, total_bytes;

  if total_records > 200 then raise exception using errcode = '23514', message = 'Account record quota exceeded'; end if;
  if total_bytes > 52428800 then raise exception using errcode = '23514', message = 'Account saved-data quota exceeded'; end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_data_quota() from public, anon, authenticated;

create trigger resumes_enforce_quota after insert or update on public.resumes
for each row execute function public.enforce_user_data_quota();
create trigger job_descriptions_enforce_quota after insert or update on public.job_descriptions
for each row execute function public.enforce_user_data_quota();
create trigger match_analyses_enforce_quota after insert or update on public.match_analyses
for each row execute function public.enforce_user_data_quota();
create trigger job_applications_enforce_quota after insert or update on public.job_applications
for each row execute function public.enforce_user_data_quota();
