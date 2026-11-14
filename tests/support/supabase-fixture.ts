/** Local test adapter only: PostgreSQL/RLS is real PGlite; Auth and Storage HTTP are simulated.
 * Never imported by app code. Listens only on loopback. No external network or emails.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database";
const db = await testDatabase();
type TestUser = { id: string; email: string; role: string; password: string };
const users: TestUser[] = [];
for (const project of ["mobile-360", "mobile-390", "tablet", "desktop"]) {
  for (const role of ["member", "admin"]) {
    const u = {
      id: randomUUID(),
      email: `${role}-${project}@example.test`,
      role,
      password: "LocalTestPassword123!",
    };
    users.push(u);
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      u.id,
      u.email,
    ]);
    await db.query("insert into profiles(id,status) values($1,'active')", [
      u.id,
    ]);
    await db.query("insert into app_user_roles(user_id,role) values($1,$2)", [
      u.id,
      role,
    ]);
  }
}
function userJson(u: TestUser) {
  return {
    id: u.id,
    email: u.email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}
function token(u: TestUser) {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: u.id, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), aud: "authenticated", role: "authenticated" })}.local-test-signature`;
}
function session(u: TestUser) {
  return {
    access_token: token(u),
    refresh_token: u.id,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: userJson(u),
  };
}
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const tables = new Set([
  "wines",
  "merchants",
  "purchase_receipts",
  "receipt_lines",
  "receipt_line_wines",
  "tasting_notes",
  "external_ratings",
  "media_assets",
  "profiles",
  "app_user_roles",
  "invitations",
  "admin_audit_logs",
  "asset_cleanup",
]);
const objects = new Map<string, Buffer>();
let queue = Promise.resolve();
const server = createServer((req, res) => {
  queue = queue
    .then(async () => {
      const url = new URL(req.url ?? "", "http://127.0.0.1:54399");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      let body: Record<string, unknown> = {};
      try {
        body = bytes.length ? JSON.parse(bytes.toString()) : {};
      } catch {}
      const send = (status: number, data: unknown) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(data));
      };
      const auth = String(req.headers.authorization ?? "").replace(
        "Bearer ",
        "",
      );
      let subject = "";
      try {
        subject = JSON.parse(
          Buffer.from(auth.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {}
      const u = users.find((x) => x.id === subject),
        service = req.headers.apikey === "local-test-secret";
      if (url.pathname === "/health") return send(200, { ok: true });
      if (url.pathname === "/auth/v1/token") {
        const account =
          url.searchParams.get("grant_type") === "refresh_token"
            ? users.find((x) => x.id === body.refresh_token)
            : users.find(
                (x) => x.email === body.email && x.password === body.password,
              );
        return account
          ? send(200, session(account))
          : send(400, {
              error_code: "invalid_credentials",
              msg: "Invalid credentials",
            });
      }
      if (url.pathname === "/auth/v1/verify") {
        const account = users.find((x) => x.id === body.token_hash);
        return account && ["invite", "recovery"].includes(String(body.type))
          ? send(200, session(account))
          : send(400, { msg: "Expired token" });
      }
      if (url.pathname === "/auth/v1/user") {
        if (!u) return send(401, { msg: "No user" });
        if (req.method === "PUT" && typeof body.password === "string")
          u.password = body.password;
        return send(200, userJson(u));
      }
      if (
        url.pathname === "/auth/v1/logout" ||
        url.pathname === "/auth/v1/recover"
      )
        return send(200, {});
      if (url.pathname === "/auth/v1/invite" && service) {
        const email = String(body.email);
        let invited = users.find((x) => x.email === email);
        if (!invited) {
          invited = {
            id: randomUUID(),
            email,
            role: "member",
            password: "LocalTestPassword123!",
          };
          users.push(invited);
          await db.query("insert into auth.users(id,email) values($1,$2)", [
            invited.id,
            email,
          ]);
        }
        return send(200, userJson(invited));
      }
      if (url.pathname.startsWith("/auth/v1/admin/users") && service) {
        const id = url.pathname.split("/")[5],
          account = users.find((x) => x.id === id);
        return send(
          200,
          id
            ? { user: account ? userJson(account) : null }
            : {
                users: users.map(userJson),
                aud: "authenticated",
                total: users.length,
              },
        );
      }
      if (url.pathname.startsWith("/storage/v1/")) {
        if (url.pathname.includes("/object/sign/")) {
          if (!u && !service) return send(403, {});
          const key = url.pathname.split("/object/sign/")[1];
          if (!service && !key.startsWith("wine-assets/" + u!.id + "/"))
            return send(403, {});
          return send(200, {
            signedURL: "/object/public/" + key + "?token=local-test",
          });
        }
        const key = url.pathname.split("/object/")[1];
        if (req.method === "GET" && key?.startsWith("public/")) {
          const stored = objects.get(key.slice(7));
          if (!stored) return send(404, {});
          res.writeHead(200, { "Content-Type": "image/webp" });
          res.end(stored);
          return;
        }
        if (!service) return send(403, {});
        if (req.method === "POST") {
          objects.set(key, bytes);
          return send(200, { Key: key });
        }
        if (req.method === "DELETE") {
          for (const path of (body.prefixes as string[]) ?? [])
            objects.delete("wine-assets/" + path);
          return send(200, []);
        }
      }
      if (!url.pathname.startsWith("/rest/v1/")) return send(404, {});
      try {
        await db.exec("begin");
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          u?.id ?? "",
        ]);
        await db.exec(
          `set local role ${service ? "service_role" : u ? "authenticated" : "anon"}`,
        );
        if (url.pathname.includes("/rpc/")) {
          const name = url.pathname.split("/rpc/")[1];
          if (!/^[a-z_]+$/.test(name)) throw new Error("bad name");
          const entries = Object.entries(body);
          const result = await db.query(
            `select public.${quote(name)}(${entries.map(([k], i) => `${quote(k)} => $${i + 1}`).join(",")}) result`,
            entries.map(([, v]) =>
              typeof v === "object" ? JSON.stringify(v) : v,
            ),
          );
          await db.exec("commit");
          return send(
            200,
            (result.rows[0] as { result: unknown })?.result ?? null,
          );
        }
        const table = url.pathname.split("/rest/v1/")[1];
        if (!tables.has(table)) throw new Error("Unknown table");
        const args: unknown[] = [],
          filters: string[] = [];
        for (const [key, v] of url.searchParams) {
          if (["select", "limit", "order", "on_conflict"].includes(key))
            continue;
          if (!v.startsWith("eq.")) throw new Error("Unsupported test filter");
          args.push(v.slice(3));
          filters.push(`${quote(key)}=$${args.length}`);
        }
        const where = filters.length ? " where " + filters.join(" and ") : "";
        let sql = "";
        if (req.method === "GET") {
          const select = url.searchParams.get("select") ?? "*";
          sql = `select ${select === "*" ? "*" : select.split(",").map(quote).join(",")} from public.${quote(table)}${where}`;
          const order = url.searchParams.get("order");
          if (order) {
            const [key, dir] = order.split(".");
            sql += ` order by ${quote(key)} ${dir === "desc" ? "desc" : "asc"}`;
          }
          const limit = url.searchParams.get("limit");
          if (limit) sql += ` limit ${Math.min(Number(limit), 10000)}`;
        } else if (req.method === "POST") {
          const entries = Object.entries(body);
          args.length = 0;
          args.push(
            ...entries.map(([, v]) =>
              typeof v === "object" && v !== null ? JSON.stringify(v) : v,
            ),
          );
          sql = `insert into public.${quote(table)} (${entries.map(([k]) => quote(k)).join(",")}) values (${entries.map((_, i) => "$" + (i + 1)).join(",")})`;
          if (
            String(req.headers.prefer).includes("resolution=merge-duplicates")
          )
            sql += " on conflict do nothing";
          sql += " returning *";
        } else if (req.method === "PATCH") {
          const entries = Object.entries(body);
          const set = entries.map(([k, v]) => {
            args.push(
              typeof v === "object" && v !== null ? JSON.stringify(v) : v,
            );
            return `${quote(k)}=$${args.length}`;
          });
          sql = `update public.${quote(table)} set ${set.join(",")}${where} returning *`;
        } else if (req.method === "DELETE")
          sql = `delete from public.${quote(table)}${where} returning *`;
        else throw new Error("Unsupported test method");
        const result = await db.query(sql, args);
        await db.exec("commit");
        const single = String(req.headers.accept).includes("vnd.pgrst.object");
        if (single && result.rows.length !== 1)
          return send(406, {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${result.rows.length} rows`,
          });
        return send(200, single ? result.rows[0] : result.rows);
      } catch (e) {
        await db.exec("rollback");
        const error = e as { message: string; code?: string };
        return send(400, {
          message: error.message,
          code: error.code ?? "TEST_ADAPTER_ERROR",
        });
      }
    })
    .catch(() => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("{}");
      }
    });
});
server.listen(54399, "127.0.0.1", () =>
  console.log(
    "Local Auth/Storage adapter with PGlite ready. No external service calls.",
  ),
);
