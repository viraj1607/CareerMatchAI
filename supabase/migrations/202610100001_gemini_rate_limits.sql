create table public.gemini_rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('analysis', 'suggestions')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, scope, window_start)
);

alter table public.gemini_rate_limit_buckets enable row level security;
revoke all on public.gemini_rate_limit_buckets from public, anon, authenticated;

create function public.consume_gemini_rate_limit(p_scope text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  hard_limit integer;
  effective_limit integer;
  bucket timestamptz;
  current_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_scope = 'analysis' then hard_limit := 5;
  elsif p_scope = 'suggestions' then hard_limit := 5;
  else raise exception 'Unsupported rate limit scope';
  end if;

  effective_limit := least(greatest(coalesce(p_limit, 1), 1), hard_limit);
  bucket := to_timestamp(floor(extract(epoch from statement_timestamp()) / 60) * 60);

  insert into public.gemini_rate_limit_buckets (user_id, scope, window_start, request_count)
  values (caller_id, p_scope, bucket, 1)
  on conflict (user_id, scope, window_start)
  do update set request_count = public.gemini_rate_limit_buckets.request_count + 1
  returning request_count into current_count;

  delete from public.gemini_rate_limit_buckets
  where user_id = caller_id and window_start < bucket - interval '5 minutes';

  return current_count <= effective_limit;
end;
$$;

revoke all on function public.consume_gemini_rate_limit(text, integer) from public, anon;
grant execute on function public.consume_gemini_rate_limit(text, integer) to authenticated;
