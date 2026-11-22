-- Store reviewed photo details only when creating a new owner wine.
-- Existing masters, owner isolation and receipt reconciliation remain unchanged.
create or replace function public.save_receipt_targets(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  owner uuid := auth.uid(); item jsonb; bottle jsonb; i int; j int;
  rid uuid; resolved uuid; wine_name text; maker text; wine_key text; summary text; original_name text; detail_key text; selected_type text;
begin
  if not private.is_active_member() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100
  then raise exception 'INVALID_RECEIPT'; end if;
  for i in 0 .. jsonb_array_length(payload->'lines')-1 loop
    item := payload->'lines'->i;
    if jsonb_typeof(item->'wines') is distinct from 'array' or jsonb_array_length(item->'wines') not between 1 and 100
    then raise exception 'INVALID_LINE'; end if;
    for j in 0 .. jsonb_array_length(item->'wines')-1 loop
      bottle := item->'wines'->j;
      -- Optional vintages normalize before the private receipt validator.
      bottle := jsonb_set(bottle,'{vintage_label}',to_jsonb(coalesce(nullif(btrim(bottle->>'vintage_label'),''),'UNKNOWN')));
      payload := jsonb_set(payload,array['lines',i::text,'wines',j::text],bottle);
      if bottle ? 'description' and jsonb_typeof(bottle->'description') not in ('string','null') then
        raise exception 'INVALID_WINE_DESCRIPTION';
      end if;
      summary := nullif(btrim(bottle->>'description'),'');
      if length(summary)>5000 then raise exception 'INVALID_WINE_DESCRIPTION'; end if;
      if bottle ? 'name_original' and jsonb_typeof(bottle->'name_original') not in ('string','null') then
        raise exception 'INVALID_WINE_NAME';
      end if;
      original_name := nullif(btrim(bottle->>'name_original'),'');
      if length(original_name)>200 then raise exception 'INVALID_WINE_NAME'; end if;
      foreach detail_key in array array['country','region','grape'] loop
        if bottle ? detail_key and (jsonb_typeof(bottle->detail_key) not in ('string','null') or length(btrim(bottle->>detail_key))>200)
        then raise exception 'INVALID_WINE_DETAILS'; end if;
      end loop;
      if bottle ? 'wine_type' and jsonb_typeof(bottle->'wine_type') <> 'string' then raise exception 'INVALID_WINE_TYPE'; end if;
      selected_type := coalesce(bottle->>'wine_type','other');
      if selected_type not in ('red','white','sparkling','rose','dessert','fortified','other') then raise exception 'INVALID_WINE_TYPE'; end if;
      if bottle->>'wine_id' is not null then continue; end if;
      wine_name := btrim(coalesce(bottle->>'wine_name', item->>'raw_label'));
      maker := nullif(btrim(bottle->>'producer'),'');
      if wine_name is null or length(wine_name) not between 1 and 300 or length(maker)>200 then raise exception 'INVALID_WINE_NAME'; end if;
      wine_key := lower(regexp_replace(btrim(normalize(wine_name,NFKC)), '\s+', ' ', 'g')) || '|' ||
                  lower(regexp_replace(btrim(normalize(coalesce(maker,''),NFKC)), '\s+', ' ', 'g'));
      -- A previously imported wine often has no producer. Reuse that unique
      -- same-name record before creating a second card for a catalogue pick.
      select id into resolved from public.wines where owner_id=owner and identity_key=wine_key;
      if resolved is null then
        select case when count(*)=1 then (array_agg(id))[1] end into resolved from public.wines
        where owner_id=owner and (maker is null or producer is null)
          and lower(regexp_replace(btrim(normalize(name_ko,NFKC)), '\s+', ' ', 'g'))
              = lower(regexp_replace(btrim(normalize(wine_name,NFKC)), '\s+', ' ', 'g'));
      end if;
      if resolved is null then
      insert into public.wines(owner_id,identity_key,name_ko,producer,wine_type,description,name_original,country,region,grape)
      values(owner,wine_key,wine_name,maker,selected_type,summary,original_name,
        nullif(btrim(bottle->>'country'),''),nullif(btrim(bottle->>'region'),''),nullif(btrim(bottle->>'grape'),''))
      on conflict(owner_id,identity_key) do nothing returning id into resolved;
      if resolved is null then
        select id into strict resolved from public.wines where owner_id=owner and identity_key=wine_key;
      end if;
      end if;
      payload := jsonb_set(payload,array['lines',i::text,'wines',j::text,'wine_id'],to_jsonb(resolved));
    end loop;
  end loop;
  rid := private.save_receipt_for(owner,payload - 'source_key');
  return jsonb_build_object('id',rid,'targets',
    (select jsonb_agg(jsonb_path_query_array(line,'$.wines[*].wine_id') order by ord)
     from jsonb_array_elements(payload->'lines') with ordinality as lines(line,ord)));
end $$;

revoke all on function public.save_receipt_targets(jsonb) from public,anon,authenticated;
grant execute on function public.save_receipt_targets(jsonb) to authenticated,service_role;
