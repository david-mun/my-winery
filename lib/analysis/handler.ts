import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertOrigin, fail } from "@/lib/http";
import { readImageForm } from "@/lib/request-body";
import { sanitizeImage } from "@/lib/image";
import { adminClient } from "@/lib/supabase/admin";
import { analysisImageBytes, analysisTask, maxWinePhotos } from "./contracts";
import { analyzeWithGemini, geminiConfig } from "./gemini";
import { AnalysisError } from "./validation";
import { loadCollectionWines } from "./collection-context";

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
    const { user, db } = await requireUser();
    const task = analysisTask.parse(taskName);
    geminiConfig();
    const form = await readImageForm(req);
    if (form.get("consent") !== "true")
      throw new AnalysisError(
        400,
        "전송할 사진과 개인정보 가리기를 확인해 주세요.",
      );
    const files = form.getAll("file");
    const winePhotos = task === "wine-photo";
    if (
      !files.length ||
      files.length > (winePhotos ? maxWinePhotos : 1) ||
      !files.every((file) => file instanceof File) ||
      files.some((file) => file.size === 0) ||
      files.reduce((sum, file) => sum + file.size, 0) > analysisImageBytes
    )
      throw new AnalysisError(
        413,
        winePhotos
          ? `사진은 최대 ${maxWinePhotos}장, 합계 3MB까지 전송할 수 있습니다.`
          : "3MB 이하 사진 한 장을 선택해 주세요.",
      );
    const images: Buffer[] = [];
    try {
      for (const file of files)
        images.push(
          await sanitizeImage(Buffer.from(await file.arrayBuffer()), file.type),
        );
    } catch {
      throw new AnalysisError(
        415,
        "사진 형식을 확인해 주세요. JPEG·PNG·WebP만 지원합니다.",
      );
    }
    if (images.some((image) => image.length > analysisImageBytes))
      throw new AnalysisError(413, "사진 크기를 더 줄여 주세요.");
    // Existing DB RPC uses atomic, shared counters, including across serverless instances.
    await consume(`analysis:minute:user:${user.id}`, 3, 60);
    await consume("analysis:minute:project", 10, 60);
    await consume(`analysis:day:user:${user.id}`, 20, 86400);
    await consume("analysis:day:project", 100, 86400);
    const wines =
      task === "wine-label" ? [] : await loadCollectionWines(db, user.id);
    response = NextResponse.json(
      await analyzeWithGemini(
        task,
        images.length === 1 ? images[0] : images,
        req.signal,
        wines,
      ),
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
