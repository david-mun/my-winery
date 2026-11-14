// The CLI uses only a project-bound session/direct URL. It never logs a URL,
// password or database error body. Untracked or divergent schema is not adopted.
import {readdir,readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {config} from "dotenv";
import pg from "pg";
const history="supabase_migrations.schema_migrations";
const tables=["profiles","app_user_roles","wines","merchants","purchase_receipts","receipt_lines","receipt_line_wines","external_ratings","tasting_notes","media_assets","import_batches","import_rows","admin_audit_logs","invitations","asset_cleanup"];
function guard(pass,msg){if(!pass){const error=new Error(msg);error.safe=true;throw error;}}
export async function migrate(db, mode){
  const files=(await readdir("supabase/migrations")).filter(f=>/^\d+_\w+\.sql$/.test(f)).sort();
  const plans=await Promise.all(files.map(async file=>({version:file.split("_")[0],name:file.slice(file.indexOf("_")+1,-4),sql:await readFile("supabase/migrations/"+file,"utf8")})));
  guard(plans.length>0 && new Set(plans.map(p=>p.version)).size===plans.length,"Invalid local migration set.");
  await db.query(mode==="apply"?"begin":"begin read only");
  try {
    await db.query("set local lock_timeout='5s';set local statement_timeout='90s'");
    if(mode==="apply")await db.query("select pg_advisory_xact_lock(hashtext('my-wine-list:migration'))");
    const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
    guard((await one("select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null as ok")).ok,"Supabase Auth/Storage schema missing.");
    const exists=(await one("select to_regclass($1) is not null ok",[history])).ok;
    const applied=exists?(await db.query("select version,name from "+history+" order by version")).rows:[];
    guard(applied.every((v,i)=>v.version===plans[i]?.version && (!v.name || v.name===plans[i]?.name)),"Remote migration history differs. No changes made.");
    if(applied.length===0){
      const collision=await one("select exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')) or exists(select from storage.buckets where id='wine-assets') or exists(select from pg_policies where schemaname='storage' and tablename='objects') or exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and (n.nspname='private' or p.proname=any($1))) as conflict",[["save_receipt","save_receipt_targets","delete_receipt","manage_user","bootstrap_admin","prepare_invitation","finish_invitation","accept_invitation","apply_snapshot","verify_snapshot","consume_rate_limit"]]);
      guard(!collision.conflict,"Untracked existing database objects or storage policies. Inspect before applying.");
    }
    const pending=plans.slice(applied.length);
    console.log("Recorded:",applied.length,"Pending:",pending.map(x=>x.version).join(", ")||"none");
    if(mode==="verify")guard(!pending.length,"Remote migrations are incomplete.");
    if(mode==="apply" && pending.length){
      await db.query("create schema if not exists supabase_migrations; create table if not exists "+history+"(version text primary key, statements text[], name text)");
      for(const p of pending){
        console.log("Applying:",p.version,p.name);
        await db.query(p.sql);
        await db.query("insert into "+history+"(version,name,statements) values($1,$2,$3)",[p.version,p.name,[p.sql]]);
      }
      await db.query("notify pgrst, 'reload schema'");
    }
    if(mode==="apply" || !pending.length){
      const checks=await one(`select
        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) and c.relrowsecurity)=$2::int as owner_tables_rls,
        exists(select from storage.buckets where id='wine-assets' and not public) as private_bucket,
        exists(select from pg_policies where schemaname='storage' and policyname='wine_assets_read') as storage_policy,
        exists(select from information_schema.columns where table_schema='public' and table_name='media_assets' and column_name='photo_credit') as credit_column,
        exists(select from pg_trigger where tgrelid='auth.users'::regclass and tgname='auth_user_final_admin' and tgenabled<>'D') as last_admin,
        has_function_privilege('authenticated','public.save_receipt_targets(jsonb)','execute') and not has_function_privilege('anon','public.save_receipt_targets(jsonb)','execute') as receipt_rpc,
        not has_function_privilege('authenticated','public.bootstrap_admin(uuid)','execute') and not has_table_privilege('authenticated','public.media_assets','insert') as restricted_writes`,[tables,tables.length]);
      for(const [name,ok] of Object.entries(checks))guard(ok,"Verification failed: "+name);
      console.log("Verified:",Object.keys(checks).join(", "));
    }
    await db.query(mode==="apply"?"commit":"rollback");
    return {pending:pending.length};
  }catch(error){await db.query("rollback").catch(()=>{});throw error;}
}
async function main(){
  config({path:".env.local",quiet:true});
  const flag=process.argv[2]??"--plan";
  guard(["--plan","--apply","--verify"].includes(flag)&&process.argv.length<=3,"Use --plan / --apply / --verify.");
  guard(process.env.SUPABASE_DB_URL,"SUPABASE_DB_URL missing in .env.local.");
  const u=new URL(process.env.SUPABASE_DB_URL);
  const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  guard(project && ["postgres:","postgresql:"].includes(u.protocol) && !u.hash && (!u.port||u.port==="5432") && u.pathname==="/postgres" &&
    ((u.hostname==="db."+project+".supabase.co" && u.username==="postgres") || (u.hostname.endsWith(".pooler.supabase.com") && u.username==="postgres."+project)),"Project URL/DB connection mismatch. Use the exact project’s session pooler or direct URL.");
  guard(u.password && !decodeURIComponent(u.password).includes("[YOUR-PASSWORD]"),"Replace the password placeholder locally.");
  const db=new pg.Client({database:"postgres",host:u.hostname,port:5432,user:u.username,password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true,ca:await readFile(new URL("./supabase-prod-ca-2021.crt",import.meta.url),"utf8")},connectionTimeoutMillis:10000});
  try{await db.connect();await migrate(db,flag.slice(2));}finally{await db.end().catch(()=>{});}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.safe?e.message:"DB connection/migration failed ("+String(e.code??e.name).replace(/[^A-Za-z0-9_]/g,"")+"). Credentials and SQL error details suppressed.");process.exitCode=1;});
