// Rehearse on disposable native PostgreSQL, never using cloud credentials.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {mkdtemp,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import assert from "node:assert/strict";
import {migrate} from "./migrate-db.mjs";
const dir=await mkdtemp(join(tmpdir(),"my-wine-pg-"));
const sock=createServer();await new Promise((res,rej)=>sock.once("error",rej).listen(0,"127.0.0.1",res));
const port=sock.address().port; await new Promise(res=>sock.close(res));
const password=randomUUID();
const server=new EmbeddedPostgres({databaseDir:dir,user:"postgres",password,port,persistent:false,autoRehydrateSymlinks:true,initdbFlags:["--encoding=UTF8"],postgresFlags:["-h","127.0.0.1","-k",dir],onLog:()=>{},onError:msg=>console.error(msg)});
const clients=[];async function connect(){const c=new pg.Client({host:"127.0.0.1",user:"postgres",password,port,database:"postgres"});await c.connect();clients.push(c);return c;}
try{
  await server.initialise();await server.start();const main=await connect();
  await main.query(await readFile(new URL("../tests/support/platform.sql",import.meta.url),"utf8"));
  await migrate(main,"plan"); await migrate(main,"apply");assert.equal((await migrate(main,"apply")).pending,0);await migrate(main,"verify");
  const a=randomUUID(),b=randomUUID();for(const id of [a,b]){
    await main.query("insert into auth.users(id,email) values($1,'local-only')",[id]);
    await main.query("insert into profiles(id,status) values($1,'active')",[id]);
    await main.query("insert into app_user_roles(user_id,role) values($1,'admin')",[id]);
  }
  async function session(id){const c=await connect();await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query("set role authenticated");return c;}
  const ca=await session(a),cb=await session(b);
  const receipt={purchased_on:"2025-10-10",paid_amount:10000,discount_amount:0,lines:[{raw_label:"Local test wine",line_kind:"wine",line_amount:10000,wines:[{bottle_quantity:1,description:"한국어 와인 설명",name_original:"Local Test Wine"}]}]};
  const {rows:[{r}]}=await ca.query("select save_receipt_targets($1) r",[receipt]);assert.ok(r.targets[0][0]);assert.equal((await cb.query("select * from wines")).rowCount,0);
  assert.equal((await ca.query("select vintage_label from receipt_line_wines")).rows[0].vintage_label,"UNKNOWN");
  assert.deepEqual((await ca.query("select description,name_original from wines")).rows[0],{description:"한국어 와인 설명",name_original:"Local Test Wine"});
  const ca2=await session(a);
  const updated=await Promise.allSettled([ca,ca2].map(c=>c.query("select save_receipt($1)",[{...receipt,id:r.id,version:1}])));
  assert.equal(updated.filter(x=>x.status==="fulfilled").length,1);
  const changed=await Promise.allSettled([[ca,a],[cb,b]].map(([c,id])=>c.query("select manage_user($1,'active','member')",[id])));
  assert.equal(changed.filter(x=>x.status==="fulfilled").length,1);
  assert.equal((await main.query("select count(*)::int as n from app_user_roles where role='admin'")).rows[0].n,1);
  console.log("PASS: native PostgreSQL, double migration, RLS isolation, purchase photo targets, concurrent receipt edits and last-admin changes.");
} finally{await Promise.allSettled(clients.map(c=>c.end()));await server.stop();}
