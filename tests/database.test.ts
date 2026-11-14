import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { snapshot } from "../scripts/snapshot";
const A = "00000000-0000-4000-a000-000000000001",
  B = "00000000-0000-4000-a000-000000000002",
  C = "00000000-0000-4000-a000-000000000003",
  D = "00000000-0000-4000-a000-000000000004";
let db: PGlite;
async function as(user: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec(`set role ${role}`);
}
async function value(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, args)).rows[0];
}
async function denied(sql: string, args: unknown[] = []) {
  await db.exec("savepoint denial");
  let failed = false;
  try {
    await db.query(sql, args);
  } catch {
    failed = true;
  }
  await db.exec("rollback to savepoint denial");
  expect(failed).toBe(true);
}
const plan = () => snapshot("tests/fixtures/data", A);
async function apply() {
  await as(null, "service_role");
  return value("select public.apply_snapshot($1,$2::jsonb) result", [
    A,
    JSON.stringify(plan()),
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to authenticated;grant all on all tables in schema storage to service_role;`);
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}'),('${D}');
 insert into public.profiles(id,status) values('${A}','active'),('${B}','active'),('${C}','disabled'),('${D}','invited');
 insert into public.app_user_roles(user_id,role) values('${A}','admin'),('${B}','member'),('${C}','member'),('${D}','member');`);
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback;reset role");
});
describe("PostgreSQL migrations and real RLS (PGlite)", () => {
  it("applies all migrations and enables RLS on every public table", async () => {
    const result = await db.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("owner CRUD works; foreign owners, inactive users and admins cannot see other content", async () => {
    await as(B);
    const w = await value(
      "insert into wines(owner_id,identity_key,name_ko,wine_type) values($1,'b','Private B','white') returning id",
      [B],
    );
    expect((await value("select count(*)::int n from wines"))?.n).toBe(1);
    for (const user of [A, C, D]) {
      await as(user);
      expect((await value("select count(*)::int n from wines"))?.n).toBe(0);
      expect(
        (
          await db.query(
            "update wines set name_ko='stolen' where id=$1 returning id",
            [w!.id],
          )
        ).rows,
      ).toHaveLength(0);
      await denied(
        "insert into wines(owner_id,identity_key,name_ko,wine_type) values($1,'x','x','red')",
        [B],
      );
    }
    await as(B);
    await db.query("update wines set name_ko='edited' where id=$1", [w!.id]);
    await db.query("delete from wines where id=$1", [w!.id]);
    expect((await value("select count(*)::int n from wines"))?.n).toBe(0);
  });
  it("anon denied; ownership changes and role escalation denied", async () => {
    await as(null, "anon");
    await denied("select * from wines");
    await denied("select public.manage_user($1,'active','admin')", [B]);
    await as(B);
    await denied("update app_user_roles set role='admin' where user_id=$1", [
      B,
    ]);
    await denied("update profiles set status='active' where id=$1", [C]);
    await denied("select public.manage_user($1,'active','admin')", [B]);
    const w = await value(
      "insert into wines(owner_id,identity_key,name_ko,wine_type) values($1,'b','B','red') returning id",
      [B],
    );
    await denied("update wines set owner_id=$1 where id=$2", [A, w!.id]);
  });
  it("imports 10 wines / 12 bottles / 2 receipts, 11 ratings / 5 notes; repeat has no duplicates", async () => {
    await apply();
    await apply();
    expect((await value("select count(*)::int n from wines"))?.n).toBe(10);
    expect(
      (await value("select count(*)::int n from external_ratings"))?.n,
    ).toBe(11);
    expect(
      (
        await value(
          "select count(*)::int n from tasting_notes where tasted_on is null",
        )
      )?.n,
    ).toBe(5);
    expect(
      (await value("select sum(paid_amount)::int n from purchase_receipts"))?.n,
    ).toBe(293900);
    expect(
      (
        await value(
          "select sum(bottle_quantity)::int n from receipt_line_wines",
        )
      )?.n,
    ).toBe(12);
    expect(
      (
        await value(
          "select count(*)::int n from receipt_line_wines where allocated_amount is null",
        )
      )?.n,
    ).toBe(2);
    expect(
      (
        await value(
          "select count(*)::int n from receipt_lines where line_kind='bundle' and line_amount=39900",
        )
      )?.n,
    ).toBe(1);
    expect(
      (
        await value(
          "select sum(line_amount)::int n from receipt_lines where line_kind='discount'",
        )
      )?.n,
    ).toBe(-18000);
    expect(
      (
        await value(
          "select count(*)::int n from receipt_line_wines where vintage_label='NV'",
        )
      )?.n,
    ).toBe(1);
    expect(
      (
        await value(
          "select count(*)::int n from external_ratings where verification_status='needs_review'",
        )
      )?.n,
    ).toBe(2);
    expect(
      (
        await value(
          "select count(*)::int n from import_rows where targets ? 'line_id'",
        )
      )?.n,
    ).toBe(12);
  });
  it("all imported private tables hide owner data from B, disabled, invited and anon", async () => {
    await apply();
    const tables = [
      "wines",
      "merchants",
      "purchase_receipts",
      "receipt_lines",
      "receipt_line_wines",
      "external_ratings",
      "tasting_notes",
      "media_assets",
    ];
    for (const user of [B, C, D]) {
      await as(user);
      for (const t of tables) {
        expect((await value(`select count(*)::int n from ${t}`))?.n).toBe(0);
      }
    }
    await as(null, "anon");
    for (const t of tables) await denied(`select * from ${t}`);
  });
  it("rejects cross-owner FK, content delete and direct receipt mutations", async () => {
    await apply();
    const foreign = plan().wines[0].id;
    await as(B);
    await denied(
      "insert into tasting_notes(owner_id,wine_id,my_rating) values($1,$2,4)",
      [B, foreign],
    );
    await denied(
      "insert into external_ratings(owner_id,wine_id,rating_scope) values($1,$2,'UNKNOWN')",
      [B, foreign],
    );
    expect(
      (await db.query("delete from wines where id=$1 returning id", [foreign]))
        .rows,
    ).toHaveLength(0);
    await as(A);
    await denied("update receipt_lines set line_amount=line_amount+1");
    await denied("delete from receipt_line_wines");
    await denied("update purchase_receipts set paid_amount=0");
  });
  it("RPC rejects reconciliation mismatch and rolls back all partial receipt writes", async () => {
    await apply();
    await as(A);
    const payload = structuredClone(plan().receipts[0]);
    payload.paid_amount++;
    await denied("select save_receipt($1::jsonb)", [JSON.stringify(payload)]);
    const bad = structuredClone(plan().receipts[0]);
    bad.lines[0].wines[0].wine_id = B;
    await denied("select save_receipt($1::jsonb)", [JSON.stringify(bad)]);
    expect(
      (await value("select count(*)::int n from purchase_receipts"))?.n,
    ).toBe(2);
  });
  it("receipt edits require version, and deletion preserves wines and independent notes", async () => {
    await apply();
    const r = await value(
      "select id,version from purchase_receipts where purchased_on='2026-09-13'",
    );
    await as(A);
    const edit = { ...plan().receipts[0], id: r!.id, version: 1 };
    await value("select save_receipt($1::jsonb)", [JSON.stringify(edit)]);
    await denied("select save_receipt($1::jsonb)", [JSON.stringify(edit)]);
    await denied("select delete_receipt($1,1)", [r!.id]);
    await value("select delete_receipt($1,2)", [r!.id]);
    expect((await value("select count(*)::int n from wines"))?.n).toBe(10);
    expect((await value("select count(*)::int n from tasting_notes"))?.n).toBe(
      5,
    );
  });
  it("snapshot changes and edited target data are rejected without overwrites", async () => {
    await apply();
    const changed = { ...plan(), checksum: "changed" };
    await denied("select apply_snapshot($1,$2::jsonb)", [
      A,
      JSON.stringify(changed),
    ]);
    await as(A);
    await db.query("update wines set name_ko='edited' where id=$1", [
      plan().wines[0].id,
    ]);
    await as(null, "service_role");
    await denied("select apply_snapshot($1,$2::jsonb)", [
      A,
      JSON.stringify(plan()),
    ]);
  });
  it("import failure leaves no partial batch or wine records", async () => {
    await as(null, "service_role");
    const bad = plan();
    bad.receipts[1].paid_amount++;
    await denied("select apply_snapshot($1,$2::jsonb)", [
      A,
      JSON.stringify(bad),
    ]);
    expect((await value("select count(*)::int n from wines"))?.n).toBe(0);
    expect((await value("select count(*)::int n from import_batches"))?.n).toBe(
      0,
    );
  });
  it("protects last active admin on disable/demotion/delete, then allows change with a second admin", async () => {
    await as(A);
    await denied("select manage_user($1,'disabled','admin')", [A]);
    await denied("select manage_user($1,'active','member')", [A]);
    await as(null, "service_role");
    await denied("delete from profiles where id=$1", [A]);
    await db.exec("reset role");
    await denied("delete from auth.users where id=$1", [A]);
    await as(A);
    await value("select manage_user($1,'active','admin')", [B]);
    await value("select manage_user($1,'disabled','member')", [A]);
    await as(B);
    await denied("select manage_user($1,'disabled','member')", [B]);
    expect(
      (
        await value(
          "select count(*)::int n from profiles p join app_user_roles r on r.user_id=p.id where p.status='active' and r.role='admin'",
        )
      )?.n,
    ).toBe(1);
  });
  it("invitation acceptance requires a sent invitation; repeated acceptance denied", async () => {
    await as(B);
    await denied("select prepare_invitation('new@example.com')");
    await as(D);
    await denied("select accept_invitation()");
    await as(A);
    const invite = await value(
      "select prepare_invitation('new@example.com') id",
    );
    await denied("select prepare_invitation('new@example.com')");
    await as(null, "service_role");
    await value("select finish_invitation($1,$2,$3,true)", [invite!.id, D, A]);
    await as(D);
    await value("select accept_invitation()");
    await denied("select accept_invitation()");
    expect(
      (await value("select status from profiles where id=$1", [D]))?.status,
    ).toBe("active");
  });
  it("private storage reads isolate owners and direct upload is denied", async () => {
    await as(null, "service_role");
    await db.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["wine-assets", `${A}/wines/photo.webp`],
    );
    await as(A);
    expect(
      (await value("select count(*)::int n from storage.objects"))?.n,
    ).toBe(1);
    await denied("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "wine-assets",
      `${A}/wines/bypass.webp`,
    ]);
    for (const user of [B, C, D]) {
      await as(user);
      expect(
        (await value("select count(*)::int n from storage.objects"))?.n,
      ).toBe(0);
    }
  });
  it('rejects missing line arrays, empty notes and mismatched rating scope at DB boundary',async()=>{
    await apply();await as(A);
    await denied('select save_receipt($1::jsonb)',[JSON.stringify({purchased_on:'2026-09-13',paid_amount:0})]);
    await denied('select save_receipt($1::jsonb)',[JSON.stringify({purchased_on:'2026-09-13',paid_amount:0,lines:[{line_kind:'wine',raw_label:'missing',line_amount:0}]})]);
    await denied('insert into tasting_notes(owner_id,wine_id,my_rating,review_text) values($1,$2,null,null)',[A,plan().wines[0].id]);
    await denied("insert into external_ratings(owner_id,wine_id,rating_scope,vintage_label) values($1,$2,'VINTAGE','UNKNOWN')",[A,plan().wines[0].id]);
  });
  it('first-admin bootstrap is server-only and cannot overwrite an existing administrator',async()=>{
    await as(B);await denied('select bootstrap_admin($1)',[B]);await as(null,'service_role');await denied('select bootstrap_admin($1)',[B]);
  });

});

it("saves raw and catalog wine names atomically in the active owner's cellar",async()=>{
  const raw="(P)원래 상품명25", picked="카탈로그 와인";
  const receipt=(selected:boolean,paid=20000)=>({
    purchased_on:"2025-11-03",paid_amount:paid,discount_amount:0, lines:[{
      line_kind:"wine",raw_label:raw,line_amount:20000,
      wines:[{...(selected?{wine_name:picked,producer:"생산자"}:{}),vintage_label:"UNKNOWN",bottle_quantity:1}]
    }]
  });
  const save="select public.save_receipt($1::jsonb)";
  await as(B);
  await denied(save,[JSON.stringify(receipt(true,1000))]);
  expect((await value("select count(*)::int n from wines"))?.n).toBe(0);
  for(const selected of [true,false,false]) await db.query(save,[JSON.stringify(receipt(selected))]);
  expect((await db.query("select name_ko from wines order by name_ko")).rows).toEqual([{name_ko:raw},{name_ko:picked}]);
  expect((await value("select count(*)::int n from receipt_lines where raw_label=$1",[raw]))?.n).toBe(3);
  await as(A); expect((await value("select count(*)::int n from wines"))?.n).toBe(0);
  await as(C);await denied(save,[JSON.stringify(receipt(false))]);
});
