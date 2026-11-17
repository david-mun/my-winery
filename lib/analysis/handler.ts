import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertOrigin, fail } from "@/lib/http";
import { readImageForm } from "@/lib/request-body";
import { sanitizeImage } from "@/lib/image";
import { adminClient } from "@/lib/supabase/admin";
import { analysisTask } from "./contracts";
import { analyzeWithGemini, geminiConfig } from "./gemini";
import { AnalysisError } from "./validation";

async function consume(bucket: string, max: number, seconds: number) {
  const { data, error } = await adminClient().rpc("consume_rate_limit", {
    bucket,
    max_hits: max,
    window_seconds: seconds,
  });
  if (error)
    throw new AnalysisError(
      503,
      "분석 사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  if (!data)
    throw new AnalysisError(
      429,
      "분석 요청이 많습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.",
    );
}
export async function handleAnalysis(req: Request, taskName: string) {
  let response: Response;
  try {
    assertOrigin(req);
    const { user } = await requireUser();
    const task = analysisTask.parse(taskName);
    geminiConfig();
    const form = await readImageForm(req);
    if (form.get("consent") !== "true")
      throw new AnalysisError(
        400,
        "전송할 사진과 개인정보 가리기를 확인해 주세요.",
      );
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 3 * 1024 * 1024 ||
      form.getAll("file").length !== 1
    )
      throw new AnalysisError(413, "3MB 이하 사진 한 장을 선택해 주세요.");
    let bytes: Buffer;
    try {
      bytes = await sanitizeImage(
        Buffer.from(await file.arrayBuffer()),
        file.type,
      );
    } catch {
      throw new AnalysisError(
        415,
        "사진 형식을 확인해 주세요. JPEG·PNG·WebP만 지원합니다.",
      );
    }
    if (bytes.length > 3 * 1024 * 1024)
      throw new AnalysisError(413, "사진 크기를 더 줄여 주세요.");
    // Existing DB RPC uses atomic, shared counters, including across serverless instances.
    await consume(`analysis:minute:user:${user.id}`, 3, 60);
    await consume("analysis:minute:project", 10, 60);
    await consume(`analysis:day:user:${user.id}`, 20, 86400);
    await consume("analysis:day:project", 100, 86400);
    response = NextResponse.json(
      await analyzeWithGemini(task, bytes, req.signal),
    );
  } catch (error) {
    response =
      error instanceof AnalysisError
        ? NextResponse.json({ error: error.message }, { status: error.status })
        : fail(error);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
