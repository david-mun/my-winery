-- My Wine List / Supabase PostgreSQL schema / design starter v1.0
-- Apply via Supabase CLI versioned migration, not directly in production without tests.
-- Assumptions: 1 private personal collection per Auth user, invite-only accounts.
-- Bootstrap first admin separately after Supabase Auth user creation (see bottom).

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  assigned_at timestamptz not null default now()
);

-- Protect these definer functions: do not put them in exposed public schema.
create or replace function private.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.app_user_roles r on r.user_id = p.id
    where p.id = (select auth.uid())
      and p.status = 'active' and r.role = 'admin'
  );
$$;

revoke all on function private.is_active_member() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_admin() to authenticated;

create table if not exists public.wines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  identity_key text not null,
  name_ko text not null,
  name_original text,
  producer text,
  wine_type text not null check (wine_type in ('red','white','sparkling','rose','dessert','fortified','other')),
  grape text,
  country text,
  region text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, identity_key),
  unique (id, owner_id)
);

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location_text text,
  created_at timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id)
);

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid,
  purchased_on date not null,
  currency char(3) not null default 'KRW',
  gross_items_amount bigint not null default 0 check (gross_items_amount >= 0),
  bundle_amount bigint not null default 0 check (bundle_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  adjustment_amount bigint not null default 0,
  paid_amount bigint not null check (paid_amount >= 0),
  source_key text,
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, source_key),
  unique (id, owner_id),
  foreign key (merchant_id, owner_id) references public.merchants(id, owner_id),
  constraint purchase_receipt_reconciles check (
    gross_items_amount + bundle_amount - discount_amount + adjustment_amount = paid_amount
  )
);

create table if not exists public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  line_no integer,
  line_kind text not null check (line_kind in ('wine','bundle','discount','fee','other')),
  raw_label text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  line_amount bigint not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (receipt_id, line_no),
  foreign key (receipt_id, owner_id) references public.purchase_receipts(id, owner_id) on delete cascade,
  constraint receipt_line_discount_sign check (line_kind <> 'discount' or line_amount <= 0)
);

create table if not exists public.receipt_line_wines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_line_id uuid not null,
  wine_id uuid not null,
  vintage_label text not null default 'UNKNOWN',
  bottle_quantity integer not null default 1 check (bottle_quantity > 0),
  allocated_amount bigint check (allocated_amount >= 0),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (receipt_line_id, owner_id) references public.receipt_lines(id, owner_id) on delete cascade,
  foreign key (wine_id, owner_id) references public.wines(id, owner_id),
  constraint vintage_label_valid check (
    vintage_label in ('NV','UNKNOWN') or vintage_label ~ '^[12][0-9]{3}$'
  )
);

create table if not exists public.external_ratings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wine_id uuid not null,
  source text not null default 'vivino',
  score numeric(2,1) check (score between 0 and 5),
  rating_scope text not null check (rating_scope in ('ALL_VINTAGES','VINTAGE','NV','UNKNOWN')),
  vintage_label text not null default 'UNKNOWN',
  checked_on date,
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('verified','needs_review','unverified')),
  notes text,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (wine_id, owner_id) references public.wines(id, owner_id) on delete cascade,
  constraint external_rating_vintage_label_valid check (
    vintage_label in ('NV','UNKNOWN') or vintage_label ~ '^[12][0-9]{3}$'
  )
);

create table if not exists public.tasting_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wine_id uuid not null,
  vintage_label text not null default 'UNKNOWN',
  my_rating numeric(2,1) check (my_rating between 0.5 and 5.0),
  review_text text,
  tasted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (wine_id, owner_id) references public.wines(id, owner_id) on delete cascade,
  constraint my_rating_step check (my_rating is null or my_rating * 2 = trunc(my_rating * 2)),
  constraint tasting_note_vintage_label_valid check (
    vintage_label in ('NV','UNKNOWN') or vintage_label ~ '^[12][0-9]{3}$'
  )
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wine_id uuid,
  receipt_id uuid,
  bucket_name text not null default 'wine-assets',
  object_path text not null,
  mime_type text not null,
  origin text not null default 'user_upload'
    check (origin in ('user_upload','migration','licensed')),
  created_at timestamptz not null default now(),
  unique (owner_id, object_path),
  unique (id, owner_id),
  foreign key (wine_id, owner_id) references public.wines(id, owner_id) on delete cascade,
  foreign key (receipt_id, owner_id) references public.purchase_receipts(id, owner_id) on delete cascade,
  check ((wine_id is not null)::int + (receipt_id is not null)::int = 1)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_file_id text not null,
  source_name text,
  source_checksum text not null,
  status text not null default 'pending'
    check (status in ('pending','validated','applied','failed')),
  created_at timestamptz not null default now(),
  unique (owner_id, source_file_id, source_checksum),
  unique (id, owner_id)
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  source_tab text not null,
  source_row integer not null,
  row_checksum text not null,
  raw_json jsonb not null,
  target_entity text,
  target_id uuid,
  created_at timestamptz not null default now(),
  foreign key (batch_id, owner_id) references public.import_batches(id, owner_id) on delete cascade,
  unique (batch_id, source_tab, source_row)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index owner filter columns and common detail screen joins.
create index if not exists wines_owner_type_idx on public.wines(owner_id, wine_type);
create index if not exists wines_owner_name_idx on public.wines(owner_id, name_ko);
create index if not exists merchants_owner_idx on public.merchants(owner_id);
create index if not exists receipts_owner_date_idx on public.purchase_receipts(owner_id, purchased_on desc);
create index if not exists receipt_lines_owner_receipt_idx on public.receipt_lines(owner_id, receipt_id);
create index if not exists receipt_line_wines_owner_wine_idx on public.receipt_line_wines(owner_id, wine_id);
create index if not exists receipt_line_wines_owner_line_idx on public.receipt_line_wines(owner_id, receipt_line_id);
create index if not exists ratings_owner_wine_date_idx on public.external_ratings(owner_id, wine_id, checked_on desc);
create index if not exists tasting_owner_wine_date_idx on public.tasting_notes(owner_id, wine_id, created_at desc);
create index if not exists media_owner_idx on public.media_assets(owner_id);
create index if not exists import_batches_owner_idx on public.import_batches(owner_id);
create index if not exists import_rows_owner_idx on public.import_rows(owner_id);
create index if not exists audit_target_date_idx on public.admin_audit_logs(target_user_id, created_at desc);

-- Enable RLS on every exposed app table. Server secret bypasses RLS by design.
alter table public.profiles enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.wines enable row level security;
alter table public.merchants enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.receipt_line_wines enable row level security;
alter table public.external_ratings enable row level security;
alter table public.tasting_notes enable row level security;
alter table public.media_assets enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.admin_audit_logs enable row level security;

-- Revoke broad default grants; allow only documented operations.
revoke all on public.profiles, public.app_user_roles, public.wines, public.merchants,
  public.purchase_receipts, public.receipt_lines, public.receipt_line_wines,
  public.external_ratings, public.tasting_notes, public.media_assets,
  public.import_batches, public.import_rows, public.admin_audit_logs
from anon, authenticated;

grant select on public.profiles, public.app_user_roles to authenticated;
grant select, insert, update, delete on public.wines, public.merchants,
  public.purchase_receipts, public.receipt_lines, public.receipt_line_wines,
  public.external_ratings, public.tasting_notes, public.media_assets
  to authenticated;

-- Role/profile changes are service-side only; users can read self, admins read statuses.
create policy profiles_read on public.profiles for select to authenticated
using ((id = (select auth.uid()) and (select private.is_active_member()))
  or (select private.is_admin()));

create policy roles_read on public.app_user_roles for select to authenticated
using ((user_id = (select auth.uid()) and (select private.is_active_member()))
  or (select private.is_admin()));

-- Apply identical owner-only policies to user-content tables.
-- Insert ownership is checked by RLS; cross-owner FKs separately prevent linking.
do $$
declare t text;
begin
  foreach t in array array[
    'wines','merchants','purchase_receipts','receipt_lines',
    'receipt_line_wines','external_ratings','tasting_notes','media_assets'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select private.is_active_member()))',
      t||'_read',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()) and (select private.is_active_member()))',
      t||'_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid()) and (select private.is_active_member())) with check (owner_id = (select auth.uid()) and (select private.is_active_member()))',
      t||'_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()) and (select private.is_active_member()))',
      t||'_delete',t
    );
  end loop;
end $$;

-- Import and audit tables receive no authenticated DML grants/policies.
-- Only trusted migration/admin code using secret client may operate them.

-- Private storage bucket; bucket must be verified private after creation.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('wine-assets','wine-assets',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false;

-- All Storage keys must be prefixed with the Auth user UUID: <user-id>/wines/..., <user-id>/receipts/...
create policy wine_assets_read on storage.objects for select to authenticated
using (bucket_id = 'wine-assets'
  and split_part(name,'/',1) = (select auth.uid())::text
  and (select private.is_active_member()));
create policy wine_assets_insert on storage.objects for insert to authenticated
with check (bucket_id = 'wine-assets'
  and split_part(name,'/',1) = (select auth.uid())::text
  and (select private.is_active_member()));
create policy wine_assets_update on storage.objects for update to authenticated
using (bucket_id = 'wine-assets'
  and split_part(name,'/',1) = (select auth.uid())::text
  and (select private.is_active_member()))
with check (bucket_id = 'wine-assets'
  and split_part(name,'/',1) = (select auth.uid())::text
  and (select private.is_active_member()));
create policy wine_assets_delete on storage.objects for delete to authenticated
using (bucket_id = 'wine-assets'
  and split_part(name,'/',1) = (select auth.uid())::text
  and (select private.is_active_member()));

-- Manual one-time bootstrap (REPLACE actual UUID, execute with trusted SQL editor AFTER Auth account exists):
-- INSERT INTO public.profiles(id, display_name, status)
-- VALUES ('YOUR-AUTH-USER-UUID', 'Owner', 'active') ON CONFLICT (id) DO NOTHING;
-- INSERT INTO public.app_user_roles(user_id, role)
-- VALUES ('YOUR-AUTH-USER-UUID', 'admin')
-- ON CONFLICT (user_id) DO UPDATE SET role = excluded.role;
-- Never expose this bootstrap operation to an unauthenticated HTTP route.

-- Additional requirements before production:
-- 1) Write Supabase pgTAP policy tests for anon/owner/other/inactive/admin.
-- 2) Server-side revoke/ban/invite logic and final-admin protection.
-- 3) Receipt-line reconciliation in one DB transaction/RPC.
-- 4) Storage resize/MIME/EXIF handling and orphan-asset cleanup.
-- 5) Migration script that generates idempotent source keys and importer rows.
