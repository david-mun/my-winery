-- Serialize all account mutations, including concurrent final-admin changes.
create table private.admin_guard (id boolean primary key default true check(id), version bigint not null default 0);
insert into private.admin_guard values(true,0);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 user_id uuid references auth.users(id), state text not null default 'pending'
 check(state in ('pending','sent','accepted','failed','reconciliation_required')),
 last_attempt timestamptz not null default now(), created_at timestamptz not null default now()
);
create table private.rate_limits (key text primary key, starts_at timestamptz not null, hits int not null);
create table public.asset_cleanup (
 object_path text primary key, owner_id uuid not null, created_at timestamptz not null default now()
);
alter table public.invitations enable row level security;
alter table public.asset_cleanup enable row level security;
grant all on public.invitations, public.asset_cleanup to service_role;
revoke all on public.invitations, public.asset_cleanup from anon, authenticated;
create policy invitations_admin on public.invitations for select to authenticated using(private.is_admin());
grant select on public.invitations to authenticated;
create policy audit_admin on public.admin_audit_logs for select to authenticated using(private.is_admin());
grant select on public.admin_audit_logs to authenticated;

create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger wines_updated before update on public.wines for each row execute function private.touch_updated();
create trigger notes_updated before update on public.tasting_notes for each row execute function private.touch_updated();
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated();
alter table public.purchase_receipts add column version integer not null default 1;

create function private.protect_admin() returns trigger language plpgsql security definer set search_path='' as $$
declare remaining int;
begin
 update private.admin_guard set version=version+1 where id;
 if TG_TABLE_NAME='profiles' then
   if old.status <> 'active' or (TG_OP='UPDATE' and new.status='active') then if TG_OP='UPDATE' then return new; else return old; end if; end if;
   if not exists(select 1 from public.app_user_roles where user_id=old.id and role='admin') then if TG_OP='UPDATE' then return new; else return old; end if; end if;
   select count(*) into remaining from public.profiles p join public.app_user_roles r on r.user_id=p.id
     where p.status='active' and r.role='admin' and p.id<>old.id;
 else
   if old.role<>'admin' or (TG_OP='UPDATE' and new.role='admin') then if TG_OP='UPDATE' then return new; else return old; end if; end if;
   if not exists(select 1 from public.profiles where id=old.user_id and status='active') then if TG_OP='UPDATE' then return new; else return old; end if; end if;
   select count(*) into remaining from public.profiles p join public.app_user_roles r on r.user_id=p.id
     where p.status='active' and r.role='admin' and p.id<>old.user_id;
 end if;
 if remaining=0 then raise exception 'LAST_ADMIN' using errcode='23514'; end if;
 if TG_OP='UPDATE' then return new; else return old; end if;
end $$;
-- BEFORE triggers inspect the existing role/profile before Auth cascades remove them.
create trigger profiles_final_admin before update or delete on public.profiles for each row execute function private.protect_admin();
create trigger roles_final_admin before update or delete on public.app_user_roles for each row execute function private.protect_admin();

create function private.protect_auth_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.admin_guard set version=version+1 where id;
 if exists(select 1 from public.profiles p join public.app_user_roles r on r.user_id=p.id where p.id=old.id and p.status='active' and r.role='admin')
 and not exists(select 1 from public.profiles p join public.app_user_roles r on r.user_id=p.id where p.id<>old.id and p.status='active' and r.role='admin') then raise exception 'LAST_ADMIN' using errcode='23514'; end if;
 return old;
end $$;
create trigger auth_user_final_admin before delete on auth.users for each row execute function private.protect_auth_admin();

create function public.manage_user(target uuid, next_status text, next_role text) returns void
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 update private.admin_guard set version=version+1 where id;
 if not private.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if next_status not in ('active','disabled') or next_role not in ('member','admin') then raise exception 'INVALID_STATE'; end if;
 select jsonb_build_object('status',p.status,'role',r.role) into previous from public.profiles p join public.app_user_roles r on r.user_id=p.id where p.id=target for update of p,r;
 if previous is null or previous->>'status'='invited' then raise exception 'INVALID_TARGET'; end if;
 update public.profiles set status=next_status where id=target;
 update public.app_user_roles set role=next_role where user_id=target;
 insert into public.admin_audit_logs(actor_id,target_user_id,action,details) values(auth.uid(),target,'account.changed',jsonb_build_object('before',previous,'status',next_status,'role',next_role));
end $$;

create function public.prepare_invitation(address text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; last_time timestamptz;
begin
 update private.admin_guard set version=version+1 where id;
 if not private.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 address=lower(trim(address));
 if length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;
 select id,last_attempt into result,last_time from public.invitations where email=address;
 if result is not null then
   if exists(select 1 from public.invitations where id=result and state='accepted') then raise exception 'ALREADY_MEMBER'; end if;
   if last_time>now()-interval '60 seconds' then raise exception 'RATE_LIMIT'; end if;
   update public.invitations set state='pending',last_attempt=now() where id=result;
 else insert into public.invitations(email) values(address) returning id into result; end if;
 insert into public.admin_audit_logs(actor_id,action,details) values(auth.uid(),'invite.requested',jsonb_build_object('invitation_id',result));
 return result;
end $$;

-- Only trusted server code finalizes the Auth API result, recording the original actor.
create function public.finish_invitation(invitation_id uuid, invited_user uuid, actor uuid, succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if succeeded then
   if invited_user is null then raise exception 'MISSING_USER'; end if;
   insert into public.profiles(id,status) values(invited_user,'invited') on conflict(id) do nothing;
   if exists(select 1 from public.profiles where id=invited_user and status<>'invited') then raise exception 'ALREADY_MEMBER'; end if;
   insert into public.app_user_roles(user_id,role) values(invited_user,'member') on conflict(user_id) do nothing;
   update public.invitations set user_id=invited_user,state='sent' where id=invitation_id;
 else update public.invitations set state='failed' where id=invitation_id; end if;
 insert into public.admin_audit_logs(actor_id,target_user_id,action,details) values(actor,invited_user,'invite.result',jsonb_build_object('invitation_id',invitation_id,'success',succeeded));
end $$;
create function public.accept_invitation() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.invitations where user_id=auth.uid() and state='sent') then raise exception 'INVITE_REQUIRED' using errcode='42501'; end if;
 update public.profiles set status='active' where id=auth.uid() and status='invited';
 if not found then raise exception 'INVALID_STATE'; end if;
 update public.invitations set state='accepted' where user_id=auth.uid();
end $$;

-- All receipt tree writes go through this validator; raw DML is not granted.
create function private.save_receipt_for(owner uuid, payload jsonb) returns uuid
language plpgsql set search_path='' as $$
declare rid uuid; lid uuid; item jsonb; bottle jsonb; n int:=0; gross bigint:=0; bundles bigint:=0; discount bigint; amount bigint; previous_version int;
begin
 rid=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines')<1 then raise exception 'EMPTY_RECEIPT'; end if;
 discount=coalesce((payload->>'discount_amount')::bigint,0);
 for item in select value from jsonb_array_elements(payload->'lines') loop
   amount=(item->>'line_amount')::bigint;
   if amount is null or amount<0 or jsonb_typeof(item->'wines') is distinct from 'array' then raise exception 'INVALID_LINE'; end if;
   if item->>'line_kind'='wine' then
     if jsonb_array_length(item->'wines')<>1 then raise exception 'ONE_WINE_REQUIRED'; end if;
     gross=gross+amount;
   elsif item->>'line_kind'='bundle' then
     if jsonb_array_length(item->'wines')<2 then raise exception 'BUNDLE_REQUIRES_TWO'; end if;
     bundles=bundles+amount;
   else raise exception 'INVALID_LINE_KIND'; end if;
 end loop;
 if discount<0 or gross+bundles-discount<>(payload->>'paid_amount')::bigint then raise exception 'RECEIPT_MISMATCH' using errcode='23514'; end if;
 if (payload->>'purchased_on')::date>(now() at time zone 'Asia/Seoul')::date then raise exception 'FUTURE_DATE'; end if;
 if payload->>'id' is not null then
   select version into previous_version from public.purchase_receipts where id=rid and owner_id=owner for update;
   if previous_version is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
   if previous_version<>(payload->>'version')::int or payload->>'version' is null then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
   update public.purchase_receipts set purchased_on=(payload->>'purchased_on')::date,
     merchant_id=nullif(payload->>'merchant_id','')::uuid,gross_items_amount=gross,bundle_amount=bundles,discount_amount=discount,
     paid_amount=(payload->>'paid_amount')::bigint,notes=payload->>'notes',version=version+1 where id=rid;
   delete from public.receipt_lines where receipt_id=rid;
 else
   insert into public.purchase_receipts(id,owner_id,merchant_id,purchased_on,gross_items_amount,bundle_amount,discount_amount,paid_amount,notes,source_key)
   values(rid,owner,nullif(payload->>'merchant_id','')::uuid,(payload->>'purchased_on')::date,gross,bundles,discount,(payload->>'paid_amount')::bigint,payload->>'notes',payload->>'source_key');
 end if;
 for item in select value from jsonb_array_elements(payload->'lines') loop
   n=n+1;
   insert into public.receipt_lines(owner_id,receipt_id,line_no,line_kind,raw_label,line_amount,notes)
   values(owner,rid,n,item->>'line_kind',item->>'raw_label',(item->>'line_amount')::bigint,item->>'notes') returning id into lid;
   for bottle in select value from jsonb_array_elements(item->'wines') loop
     if item->>'line_kind'='wine' and (item->>'line_amount')::bigint % (bottle->>'bottle_quantity')::int<>0 then raise exception 'NON_INTEGER_UNIT_PRICE'; end if;
     insert into public.receipt_line_wines(owner_id,receipt_line_id,wine_id,vintage_label,bottle_quantity,allocated_amount)
     values(owner,lid,(bottle->>'wine_id')::uuid,bottle->>'vintage_label',(bottle->>'bottle_quantity')::int,
       case when item->>'line_kind'='wine' then (item->>'line_amount')::bigint else null end);
   end loop;
 end loop;
 if discount>0 then insert into public.receipt_lines(owner_id,receipt_id,line_no,line_kind,raw_label,line_amount) values(owner,rid,n+1,'discount','영수증 할인',-discount); end if;
 return rid;
end $$;
create function public.save_receipt(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return private.save_receipt_for(auth.uid(),payload - 'source_key');
end $$;
create function public.delete_receipt(receipt uuid, expected_version int) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 -- Queue asset deletion before cascading metadata.
 perform 1 from public.purchase_receipts where id=receipt and owner_id=auth.uid() and version=expected_version for update;
 if not found then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 insert into public.asset_cleanup(object_path,owner_id) select object_path,owner_id from public.media_assets where receipt_id=receipt on conflict do nothing;
 delete from public.purchase_receipts where id=receipt and owner_id=auth.uid();
end $$;
create function private.queue_media_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.asset_cleanup(object_path,owner_id) values(old.object_path,old.owner_id) on conflict do nothing; return old; end $$;
create trigger media_cleanup after delete on public.media_assets for each row execute function private.queue_media_delete();

create function public.consume_rate_limit(bucket text, max_hits int, window_seconds int) returns boolean language plpgsql security definer set search_path='' as $$
declare count_hits int;
begin
 insert into private.rate_limits(key,starts_at,hits) values(bucket,now(),1)
 on conflict(key) do update set hits=case when private.rate_limits.starts_at<now()-make_interval(secs=>window_seconds) then 1 else private.rate_limits.hits+1 end,
 starts_at=case when private.rate_limits.starts_at<now()-make_interval(secs=>window_seconds) then now() else private.rate_limits.starts_at end returning hits into count_hits;
 return count_hits<=max_hits;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_member(),private.is_admin() to authenticated;
revoke all on function public.manage_user(uuid,text,text),public.prepare_invitation(text),public.finish_invitation(uuid,uuid,uuid,boolean),public.accept_invitation(),public.save_receipt(jsonb),public.delete_receipt(uuid,int),public.consume_rate_limit(text,int,int) from public,anon,authenticated;
grant execute on function public.manage_user(uuid,text,text),public.prepare_invitation(text),public.accept_invitation(),public.save_receipt(jsonb),public.delete_receipt(uuid,int) to authenticated;
grant execute on function public.manage_user(uuid,text,text),public.prepare_invitation(text),public.finish_invitation(uuid,uuid,uuid,boolean),public.accept_invitation(),public.save_receipt(jsonb),public.delete_receipt(uuid,int),public.consume_rate_limit(text,int,int) to service_role;
