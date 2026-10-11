create type public.application_status as enum (
  'Interested', 'Preparing', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'
);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  content jsonb not null,
  original_content jsonb not null,
  extracted_text text not null default '' check (length(extracted_text) <= 200000),
  original_resume_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (original_resume_id, user_id) references public.resumes(id, user_id) on delete set null (original_resume_id)
);
create index resumes_user_updated_idx on public.resumes(user_id, updated_at desc);

create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_title text not null check (length(btrim(job_title)) between 1 and 200),
  company_name text not null default '' check (length(company_name) <= 200),
  original_description text not null check (length(original_description) between 1 and 30000),
  reviewed_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index job_descriptions_user_updated_idx on public.job_descriptions(user_id, updated_at desc);

create table public.match_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid,
  job_description_id uuid,
  deterministic_score numeric(5,2) check (deterministic_score is null or deterministic_score between 0 and 100),
  deterministic_results jsonb not null,
  ai_contextual_analysis jsonb,
  is_stale boolean not null default false,
  formula_version text not null default 'phase4-v1',
  analyzed_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (resume_id, user_id) references public.resumes(id, user_id) on delete set null (resume_id),
  foreign key (job_description_id, user_id) references public.job_descriptions(id, user_id) on delete set null (job_description_id)
);
create index match_analyses_user_date_idx on public.match_analyses(user_id, analyzed_at desc);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_title text not null check (length(job_title) between 1 and 200),
  company_name text not null check (length(company_name) between 1 and 200),
  job_url text check (job_url is null or (length(job_url) <= 2048 and job_url ~* '^https?://[^[:space:]]+$')),
  status public.application_status not null default 'Interested',
  application_date date,
  notes text not null default '' check (length(notes) <= 10000),
  resume_id uuid,
  job_description_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (resume_id, user_id) references public.resumes(id, user_id) on delete set null (resume_id),
  foreign key (job_description_id, user_id) references public.job_descriptions(id, user_id) on delete set null (job_description_id)
);
create index job_applications_user_updated_idx on public.job_applications(user_id, updated_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger resumes_updated_at before update on public.resumes for each row execute function public.set_updated_at();
create trigger job_descriptions_updated_at before update on public.job_descriptions for each row execute function public.set_updated_at();
create trigger job_applications_updated_at before update on public.job_applications for each row execute function public.set_updated_at();

create function public.mark_analyses_stale_for_resume()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content or new.extracted_text is distinct from old.extracted_text then
    update public.match_analyses set is_stale = true where resume_id = old.id and user_id = old.user_id;
  end if;
  return new;
end;
$$;
create trigger resume_content_changed after update on public.resumes for each row execute function public.mark_analyses_stale_for_resume();

create function public.mark_analyses_stale_after_resume_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.match_analyses set is_stale = true where resume_id = old.id and user_id = old.user_id;
  return old;
end;
$$;
create trigger resume_deleted before delete on public.resumes for each row execute function public.mark_analyses_stale_after_resume_delete();

create function public.mark_analyses_stale_for_job()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.job_title is distinct from old.job_title or new.company_name is distinct from old.company_name
    or new.original_description is distinct from old.original_description or new.reviewed_requirements is distinct from old.reviewed_requirements then
    update public.match_analyses set is_stale = true where job_description_id = old.id and user_id = old.user_id;
  end if;
  return new;
end;
$$;
create trigger job_description_changed after update on public.job_descriptions for each row execute function public.mark_analyses_stale_for_job();

create function public.mark_analyses_stale_after_job_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.match_analyses set is_stale = true where job_description_id = old.id and user_id = old.user_id;
  return old;
end;
$$;
create trigger job_description_deleted before delete on public.job_descriptions for each row execute function public.mark_analyses_stale_after_job_delete();

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.job_descriptions enable row level security;
alter table public.match_analyses enable row level security;
alter table public.job_applications enable row level security;

create policy "profiles select own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "resumes select own" on public.resumes for select to authenticated using ((select auth.uid()) = user_id);
create policy "resumes insert own" on public.resumes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "resumes update own" on public.resumes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "resumes delete own" on public.resumes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "job descriptions select own" on public.job_descriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "job descriptions insert own" on public.job_descriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "job descriptions update own" on public.job_descriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "job descriptions delete own" on public.job_descriptions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "analyses select own" on public.match_analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy "analyses insert own" on public.match_analyses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "analyses update own" on public.match_analyses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "analyses delete own" on public.match_analyses for delete to authenticated using ((select auth.uid()) = user_id);

create policy "applications select own" on public.job_applications for select to authenticated using ((select auth.uid()) = user_id);
create policy "applications insert own" on public.job_applications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "applications update own" on public.job_applications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "applications delete own" on public.job_applications for delete to authenticated using ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.resumes, public.job_descriptions, public.match_analyses, public.job_applications to authenticated;
revoke all on public.profiles, public.resumes, public.job_descriptions, public.match_analyses, public.job_applications from anon;

create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id = caller_id;
  if not found then raise exception 'Account no longer exists'; end if;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
