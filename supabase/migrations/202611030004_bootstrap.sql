-- Explicit one-time CLI operation, never available to anonymous/authenticated clients.
create function public.bootstrap_admin(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.admin_guard set version=version+1 where id;
 if exists(select 1 from public.app_user_roles where role='admin') then raise exception 'ADMIN_ALREADY_EXISTS'; end if;
 if not exists(select 1 from auth.users where id=target) then raise exception 'AUTH_USER_REQUIRED'; end if;
 insert into public.profiles(id,status,display_name) values(target,'active','첫 관리자')
 on conflict(id) do update set status='active';
 insert into public.app_user_roles(user_id,role) values(target,'admin') on conflict(user_id) do update set role='admin';
 insert into public.admin_audit_logs(actor_id,target_user_id,action) values(target,target,'admin.bootstrapped');
end $$;
revoke all on function public.bootstrap_admin(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_admin(uuid) to service_role;
