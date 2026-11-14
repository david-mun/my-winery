-- Unconstrained numeric lets the check reject hundredths before rounding.
alter table public.tasting_notes
  drop constraint my_rating_step,
  drop constraint tasting_notes_my_rating_check,
  alter column my_rating type numeric,
  add constraint personal_rating_tenths check (
    my_rating between 1 and 5 and my_rating = round(my_rating, 1)
  ) not valid;

-- Leave historical half-point scores intact. New or edited scores use the new scale.
do $$
begin
  if not exists (select 1 from public.tasting_notes where my_rating < 1) then
    alter table public.tasting_notes validate constraint personal_rating_tenths;
  end if;
end $$;
