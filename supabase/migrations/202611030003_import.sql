alter table public.import_batches add column target_ids jsonb not null default '{}';
alter table public.import_batches add column result_hash text;
alter table public.import_batches add column report jsonb;
-- Freeze a source after first application; changed snapshots need an explicit reconciliation workflow.
create unique index import_source_once on public.import_batches(owner_id,source_file_id);
create function private.import_state(owner uuid, ids jsonb) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'wines',(select jsonb_agg(to_jsonb(w) order by id) from public.wines w where w.owner_id=owner and id in (select value::text::uuid from jsonb_array_elements_text(ids->'wines'))),
 'merchants',(select jsonb_agg(to_jsonb(w) order by id) from public.merchants w where w.owner_id=owner and id in (select value::text::uuid from jsonb_array_elements_text(ids->'merchants'))),
 'ratings',(select jsonb_agg(to_jsonb(w) order by id) from public.external_ratings w where w.owner_id=owner and id in (select value::text::uuid from jsonb_array_elements_text(ids->'ratings'))),
 'notes',(select jsonb_agg(to_jsonb(w) order by id) from public.tasting_notes w where w.owner_id=owner and id in (select value::text::uuid from jsonb_array_elements_text(ids->'notes'))),
 'receipts',(select jsonb_agg(to_jsonb(w) order by id) from public.purchase_receipts w where w.owner_id=owner and id in (select value::text::uuid from jsonb_array_elements_text(ids->'receipts'))),
 'lines',(select jsonb_agg(to_jsonb(w) order by id) from public.receipt_lines w where w.owner_id=owner and receipt_id in (select value::text::uuid from jsonb_array_elements_text(ids->'receipts'))),
 'links',(select jsonb_agg(to_jsonb(w) order by id) from public.receipt_line_wines w where w.owner_id=owner and receipt_line_id in(select id from public.receipt_lines where receipt_id in (select value::text::uuid from jsonb_array_elements_text(ids->'receipts'))))
 );
$$;
create function public.verify_snapshot(owner uuid, source_id text, checksum text) returns jsonb language plpgsql security definer set search_path='' as $$
declare batch public.import_batches;
begin
 select * into batch from public.import_batches where owner_id=owner and source_file_id=source_id;
 if batch.id is null or batch.source_checksum<>checksum then raise exception 'SOURCE_CONFLICT'; end if;
 if batch.result_hash<>md5(private.import_state(owner,batch.target_ids)::text) then raise exception 'IMPORTED_DATA_CHANGED'; end if;
 return jsonb_build_object('verified',true,'report',batch.report);
end $$;
create function public.apply_snapshot(owner uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; bid uuid; rid uuid; ids jsonb; receipt_ids jsonb:='[]'; targets jsonb; line_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':'||(payload->>'source_file_id'),0));
 if not exists(select 1 from public.profiles p join public.app_user_roles r on r.user_id=p.id where p.id=owner and p.status='active' and r.role='admin') then raise exception 'ACTIVE_ADMIN_OWNER_REQUIRED'; end if;
 if exists(select 1 from public.import_batches where owner_id=owner and source_file_id=payload->>'source_file_id') then return public.verify_snapshot(owner,payload->>'source_file_id',payload->>'checksum'); end if;
 insert into public.import_batches(owner_id,source_file_id,source_name,source_checksum,status,report)
 values(owner,payload->>'source_file_id',payload->>'source_name',payload->>'checksum','pending',payload->'report') returning id into bid;
 for item in select value from jsonb_array_elements(payload->'wines') loop
 insert into public.wines(id,owner_id,identity_key,name_ko,name_original,producer,wine_type,grape,country,region,description)
 values((item->>'id')::uuid,owner,item->>'identity_key',item->>'name_ko',item->>'name_original',item->>'producer',item->>'wine_type',item->>'grape',item->>'country',item->>'region',item->>'description');
 end loop;
 for item in select value from jsonb_array_elements(payload->'merchants') loop
 insert into public.merchants(id,owner_id,name) values((item->>'id')::uuid,owner,item->>'name'); end loop;
 for item in select value from jsonb_array_elements(payload->'receipts') loop
 rid=private.save_receipt_for(owner,item);receipt_ids=receipt_ids||jsonb_build_array(rid);end loop;
 for item in select value from jsonb_array_elements(payload->'ratings') loop
 insert into public.external_ratings(id,owner_id,wine_id,source,score,rating_scope,vintage_label,checked_on,source_url,source_row,verification_status,notes)
 values((item->>'id')::uuid,owner,(item->>'wine_id')::uuid,'vivino',(item->>'score')::numeric,item->>'rating_scope',item->>'vintage_label',(item->>'checked_on')::date,item->>'source_url',(item->>'source_row')::int,item->>'verification_status',item->>'notes');end loop;
 for item in select value from jsonb_array_elements(payload->'notes') loop
 insert into public.tasting_notes(id,owner_id,wine_id,vintage_label,my_rating,review_text,tasted_on)
 values((item->>'id')::uuid,owner,(item->>'wine_id')::uuid,item->>'vintage_label',(item->>'my_rating')::numeric,item->>'review_text',null);end loop;
 for item in select value from jsonb_array_elements(payload->'rows') loop
 targets=item->'targets';select id into rid from public.purchase_receipts where owner_id=owner and source_key=targets->>'receipt_source_key';
 select id into line_id from public.receipt_lines where receipt_id=rid and line_no=(targets->>'line_no')::int;
 targets=targets||jsonb_build_object('receipt_id',rid,'line_id',line_id);
 insert into public.import_rows(owner_id,batch_id,source_tab,source_row,row_checksum,raw_json,targets) values(owner,bid,payload->>'source_tab',(item->>'source_row')::int,item->>'row_checksum',item->'raw_json',targets);end loop;
 ids=jsonb_build_object('receipts',receipt_ids,'wines',(select jsonb_agg(value->'id') from jsonb_array_elements(payload->'wines')),
 'merchants',(select jsonb_agg(value->'id') from jsonb_array_elements(payload->'merchants')),
 'ratings',(select jsonb_agg(value->'id') from jsonb_array_elements(payload->'ratings')),
 'notes',(select jsonb_agg(value->'id') from jsonb_array_elements(payload->'notes')));
 update public.import_batches set target_ids=ids,result_hash=md5(private.import_state(owner,ids)::text),status='applied' where id=bid;
 return public.verify_snapshot(owner,payload->>'source_file_id',payload->>'checksum');
end $$;
revoke all on function private.import_state(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apply_snapshot(uuid,jsonb),public.verify_snapshot(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_snapshot(uuid,jsonb),public.verify_snapshot(uuid,text,text) to service_role;
