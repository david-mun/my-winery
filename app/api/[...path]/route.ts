import { commonsPhotos } from "@/lib/wine-photo-catalog";
import { readJson, readImageForm, readBody } from "@/lib/request-body";
import { serverEnv } from "@/lib/env";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { AppError, requireUser } from "@/lib/auth";
import { assertOrigin, dbError, fail } from "@/lib/http";
import { wineInput, noteInput, ratingInput, receiptInput } from "@/lib/domain";
import { identityKey } from "@/lib/security";
import { checkProof, clearProof } from "@/lib/auth-proof";
import { sanitizeImage } from "@/lib/image";
import { cleanupAssets } from "@/lib/cleanup";
export const runtime = "nodejs";
const uuid = z.uuid();
type Context = { params: Promise<{ path: string[] }> };
async function rate(bucket: string, max = 20) {
  const { data, error } = await adminClient().rpc("consume_rate_limit", {
    bucket,
    max_hits: max,
    window_seconds: 60,
  });
  if (error) throw new AppError(503, "DB 설정을 먼저 완료해 주세요.");
  if (!data)
    throw new AppError(429, "요청이 많습니다. 잠시 후 다시 시도해 주세요.");
}
async function handle(req: Request, ctx: Context) {
  try {
    const { path } = await ctx.params;
    const [resource, id] = path;
    if (req.method !== "GET") assertOrigin(req);
    if (resource === "auth") {
      if (req.method !== "POST")
        throw new AppError(405, "허용되지 않은 요청입니다.");
      const db = await supabase();
      if (id === "logout") {
        await db.auth.signOut();
        await clearProof();
        return NextResponse.json({ ok: true });
      }
      const body = await readJson(req);
      if (id === "login" || id === "reset") {
        const email = z.email().parse(body.email).trim().toLowerCase();
        await rate(
          "auth:" + createHash("sha256").update(email).digest("hex"),
          10,
        );
        if (id === "login") {
          const { error } = await db.auth.signInWithPassword({
            email,
            password: z.string().min(1).max(256).parse(body.password),
          });
          if (error)
            throw new AppError(400, "이메일과 비밀번호를 확인해 주세요.");
        } else {
          await db.auth.resetPasswordForEmail(email, {
            redirectTo: `${serverEnv().appUrl}/auth/callback?type=recovery`,
          });
        }
        return NextResponse.json({ ok: true });
      }
      if (id === "password") {
        const {
          data: { user },
        } = await db.auth.getUser();
        const flow = z.enum(["invite", "recovery"]).parse(body.flow);
        if (!user || !(await checkProof(user.id, flow)))
          throw new AppError(
            403,
            "유효한 초대/재설정 링크로 다시 접속해 주세요.",
          );
        const password = z
          .string()
          .min(12, "비밀번호는 12자 이상 입력해 주세요.")
          .max(128)
          .parse(body.password);
        const { error } = await db.auth.updateUser({ password });
        dbError(error);
        if (flow === "invite") {
          const { error } = await db.rpc("accept_invitation");
          dbError(error);
        }
        await clearProof();
        return NextResponse.json({ ok: true });
      }
      throw new AppError(404, "찾을 수 없습니다.");
    }
    const { db, user, isAdmin } = await requireUser(resource === "admin");
    if (req.method !== "GET") await rate("write:" + user.id, 60);
    if (resource === "media") {
      if (req.method === "POST") {
        const length = Number(req.headers.get("content-length") ?? 0);
        if (length > 11 * 1024 * 1024)
          throw new AppError(413, "파일은 10MB 이하로 첨부해 주세요.");
        const form = await readImageForm(req),
          file = form.get("file");
        const kind = z.enum(["wine", "receipt"]).parse(form.get("kind")),
          target = uuid.parse(form.get("target"));
        const commonsId = form.get("commons_id");
        if (
          commonsId == null &&
          (!(file instanceof File) || file.size > 10 * 1024 * 1024)
        )
          throw new AppError(400, "10MB 이하 이미지를 선택해 주세요.");
        const { data } = await db
          .from(kind === "wine" ? "wines" : "purchase_receipts")
          .select("id")
          .eq("id", target)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!data) throw new AppError(404, "찾을 수 없습니다.");
        let bytes: Buffer;
        let credit: {
          title: string;
          page: string;
          license: string;
          licenseUrl: string;
          author: string;
        } | null = null;
        try {
          if (commonsId != null) {
            if (
              kind !== "wine" ||
              file ||
              typeof commonsId !== "string" ||
              !/^[1-9]\d{0,11}$/.test(commonsId)
            )
              throw Error();
            const signal = AbortSignal.timeout(18000);
            const [hit] = await commonsPhotos(
              { id: Number(commonsId) },
              signal,
            );
            if (!hit || hit.id !== Number(commonsId)) throw Error();
            const image = await fetch(hit.url, {
              signal,
              redirect: "error",
              cache: "no-store",
            });
            if (!image.ok) throw Error();
            bytes = await sanitizeImage(
              Buffer.from(await readBody(image, 10 * 1024 * 1024)),
              image.headers.get("content-type")?.split(";")[0] ?? "",
            );
            credit = {
              title: hit.title,
              page: hit.page,
              license: hit.license,
              licenseUrl: hit.licenseUrl,
              author: hit.author,
            };
          } else {
            if (!(file instanceof File)) throw Error();
            bytes = await sanitizeImage(
              Buffer.from(await file.arrayBuffer()),
              file.type,
            );
          }
        } catch {
          throw new AppError(
            400,
            commonsId
              ? "사진의 사용 조건이나 파일을 확인하지 못했습니다. 직접 찍은 사진을 첨부하세요."
              : "JPEG/PNG/WebP 이미지(40MP 이하)만 지원합니다.",
          );
        }
        const admin = adminClient(),
          assetId = crypto.randomUUID(),
          objectPath = `${user.id}/${kind === "wine" ? "wines" : "receipts"}/${assetId}.webp`;
        const { error: uploadError } = await admin.storage
          .from("wine-assets")
          .upload(objectPath, bytes, {
            contentType: "image/webp",
            upsert: false,
          });
        dbError(uploadError);
        const { error } = await admin.from("media_assets").insert({
          id: assetId,
          owner_id: user.id,
          wine_id: kind === "wine" ? target : null,
          receipt_id: kind === "receipt" ? target : null,
          object_path: objectPath,
          mime_type: "image/webp",
          ...(credit ? { origin: "licensed", photo_credit: credit } : {}),
        });
        if (error) {
          await admin
            .from("asset_cleanup")
            .upsert({ object_path: objectPath, owner_id: user.id });
          await cleanupAssets(user.id);
          dbError(error);
        }
        return NextResponse.json({ id: assetId });
      }
      uuid.parse(id);
      const { data: asset } = await db
        .from("media_assets")
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!asset) throw new AppError(404, "찾을 수 없습니다.");
      if (req.method === "GET") {
        const { data, error } = await db.storage
          .from("wine-assets")
          .createSignedUrl(asset.object_path, 60);
        dbError(error);
        return NextResponse.redirect(data!.signedUrl, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      if (req.method === "DELETE") {
        const { error } = await adminClient()
          .from("media_assets")
          .delete()
          .eq("id", id)
          .eq("owner_id", user.id);
        dbError(error);
        await cleanupAssets(user.id);
        return NextResponse.json({ ok: true });
      }
    }
    if (resource === "admin") {
      if (!isAdmin) throw new AppError(403, "관리자만 사용할 수 있습니다.");
      const admin = adminClient();
      if (req.method === "GET" && id === "users") {
        const { data: auth, error } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        dbError(error);
        const [{ data: profiles }, { data: roles }] = await Promise.all([
          db.from("profiles").select("*"),
          db.from("app_user_roles").select("*"),
        ]);
        return NextResponse.json({
          users: auth.users.map((u) => ({
            id: u.id,
            email: u.email,
            ...profiles?.find((p) => p.id === u.id),
            role: roles?.find((r) => r.user_id === u.id)?.role ?? "member",
          })),
        });
      }
      if (req.method === "POST" && id === "invite") {
        const email = z
          .email()
          .parse((await readJson(req)).email)
          .trim()
          .toLowerCase();
        const { data: invitationId, error: prepareError } = await db.rpc(
          "prepare_invitation",
          { address: email },
        );
        dbError(prepareError);
        const { data: existing } = await admin
          .from("invitations")
          .select("user_id")
          .eq("id", invitationId)
          .single();
        let invitedId: string | null = existing?.user_id ?? null;
        let sent = false;
        const { data: invited, error: inviteError } =
          await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${serverEnv().appUrl}/auth/callback?type=invite`,
          });
        sent = !inviteError;
        invitedId = invited.user?.id ?? invitedId;
        const { error } = await admin.rpc("finish_invitation", {
          invitation_id: invitationId,
          invited_user: invitedId,
          actor: user.id,
          succeeded: sent,
        });
        if (error) {
          await admin
            .from("invitations")
            .update({ state: "reconciliation_required", user_id: invitedId })
            .eq("id", invitationId);
          throw new AppError(
            503,
            "초대 결과를 확인해야 합니다. 관리자 이력에서 복구 상태를 확인해 주세요.",
          );
        }
        if (!sent)
          throw new AppError(
            502,
            "초대 메일을 보내지 못했습니다. SMTP 설정을 확인해 주세요.",
          );
        return NextResponse.json({ ok: true });
      }
      if (req.method === "PATCH" && id === "users") {
        const target = uuid.parse(path[2]);
        const body = z
          .object({
            status: z.enum(["active", "disabled"]),
            role: z.enum(["admin", "member"]),
          })
          .parse(await readJson(req));
        if (body.status === "active") {
          // Preflight under caller authorization; never activate DB until Auth unban succeeds.
          const { data: profile } = await db
            .from("profiles")
            .select("status")
            .eq("id", target)
            .single();
          if (!profile || profile.status === "invited")
            throw new AppError(409, "초대 수락을 먼저 완료해 주세요.");
          const { error } = await admin.auth.admin.updateUserById(target, {
            ban_duration: "none",
          });
          dbError(error);
        }
        const { error } = await db.rpc("manage_user", {
          target,
          next_status: body.status,
          next_role: body.role,
        });
        dbError(error);
        if (body.status === "disabled") {
          const { error: banError } = await admin.auth.admin.updateUserById(
            target,
            { ban_duration: "876000h" },
          );
          await admin.from("admin_audit_logs").insert({
            actor_id: user.id,
            target_user_id: target,
            action: banError ? "auth.ban_failed" : "auth.banned",
            details: {},
          });
          if (banError)
            return NextResponse.json({
              ok: true,
              warning:
                "앱 접근은 차단되었습니다. Auth 비활성화는 재시도가 필요합니다.",
            });
        }
        return NextResponse.json({ ok: true });
      }
    }
    if (resource === "purchases") {
      if (req.method === "POST" || req.method === "PATCH") {
        const payload = receiptInput.parse(await readJson(req));
        if (req.method === "PATCH" && payload.id !== id)
          throw new AppError(400, "대상이 일치하지 않습니다.");
        const { data, error } = await db.rpc("save_receipt_targets", {
          payload,
        });
        dbError(error);
        return NextResponse.json(data);
      }
      if (req.method === "DELETE") {
        const { version } = z
          .object({ version: z.number().int().positive() })
          .parse(await readJson(req));
        const { error } = await db.rpc("delete_receipt", {
          receipt: uuid.parse(id),
          expected_version: version,
        });
        dbError(error);
        await cleanupAssets(user.id);
        return NextResponse.json({ ok: true });
      }
    }
    if (["wines", "reviews", "ratings", "merchants"].includes(resource)) {
      const table = {
        wines: "wines",
        reviews: "tasting_notes",
        ratings: "external_ratings",
        merchants: "merchants",
      }[resource]!;
      if (req.method === "DELETE") {
        const { data, error } = await db
          .from(table)
          .delete()
          .eq("id", uuid.parse(id))
          .eq("owner_id", user.id)
          .select("id");
        dbError(error);
        if (!data?.length) throw new AppError(404, "찾을 수 없습니다.");
        await cleanupAssets(user.id);
        return NextResponse.json({ ok: true });
      }
      if (req.method === "POST" || req.method === "PATCH") {
        const body = await readJson(req);
        let value: Record<string, unknown>;
        if (resource === "wines") {
          const v = wineInput.parse(body);
          value = { ...v, identity_key: identityKey(v.name_ko, v.producer) };
        } else if (resource === "reviews") value = noteInput.parse(body);
        else if (resource === "ratings") value = ratingInput.parse(body);
        else
          value = z
            .object({ name: z.string().trim().min(1).max(200) })
            .parse(body);
        let result;
        if (req.method === "POST")
          result = await db
            .from(table)
            .insert({ ...value, owner_id: user.id })
            .select("id")
            .single();
        else
          result = await db
            .from(table)
            .update(value)
            .eq("id", uuid.parse(id))
            .eq("owner_id", user.id)
            .select("id")
            .single();
        dbError(result.error);
        return NextResponse.json({ id: result.data?.id });
      }
    }
    throw new AppError(404, "찾을 수 없습니다.");
  } catch (error) {
    return fail(error);
  }
}
export const GET = handle,
  POST = handle,
  PATCH = handle,
  DELETE = handle;
