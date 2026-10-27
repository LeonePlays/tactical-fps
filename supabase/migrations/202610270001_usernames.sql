-- Apply in Supabase SQL Editor. No emails are exposed to anon/authenticated roles.
create unique index if not exists tactical_username_unique
on auth.users (lower(raw_user_meta_data ->> 'username'))
where raw_user_meta_data ->> 'username' is not null;

create or replace function public.validate_tactical_username()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.raw_user_meta_data ->> 'username' is not null then
    if (new.raw_user_meta_data ->> 'username') !~ '^[a-z0-9_]{3,20}$' then
      raise exception 'Username must have 3-20 lowercase letters, numbers or underscores';
    end if;
  elsif TG_OP = 'INSERT' and new.raw_app_meta_data ->> 'provider' = 'email' then
    raise exception 'Username is required';
  end if;
  return new;
end;
$$;
drop trigger if exists tactical_validate_username on auth.users;
create trigger tactical_validate_username before insert or update of raw_user_meta_data on auth.users
for each row execute function public.validate_tactical_username();

create or replace function public.tactical_login_email(requested_username text)
returns text language sql stable security definer set search_path = '' as $$
  select email from auth.users where lower(raw_user_meta_data ->> 'username') = lower(requested_username) limit 1;
$$;
revoke all on function public.tactical_login_email(text) from public, anon, authenticated;
grant execute on function public.tactical_login_email(text) to service_role;
