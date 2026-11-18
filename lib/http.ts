import { serverEnv, ServiceConfigurationError } from "@/lib/env";
import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./auth";
import { sameOrigin } from "./security";
export function assertOrigin(req: Request) {
  if (
    !sameOrigin(
      req.headers.get("origin"),
      serverEnv().appUrl ?? "http://localhost:3000",
    )
  )
    throw new AppError(403, "요청 출처가 올바르지 않습니다.");
}
export function fail(error: unknown) {
  if (error instanceof ServiceConfigurationError)
    return NextResponse.json(
      {
        error:
          "서비스 연결 설정이 완료되지 않았습니다. 관리자에게 이 배포의 설정을 요청해 주세요.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  if (error instanceof Error && error.message === "BODY_TOO_LARGE")
    return NextResponse.json(
      { error: "사진 또는 입력 내용의 크기를 줄여 주세요." },
      { status: 413 },
    );
  if (error instanceof Error && error.message === "INVALID_JSON")
    return NextResponse.json(
      { error: "입력 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        "요청을 처리하지 못했습니다. 설정과 입력값을 확인한 뒤 다시 시도해 주세요.",
    },
    { status: 500 },
  );
}
export function dbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const conflict = /LAST_ADMIN|EDIT_CONFLICT|ALREADY_MEMBER|23505/.test(
    error.message + " " + error.code,
  );
  throw new AppError(
    conflict ? 409 : 400,
    /LAST_ADMIN/.test(error.message)
      ? "마지막 관리자는 비활성화하거나 강등할 수 없습니다."
      : /EDIT_CONFLICT/.test(error.message)
        ? "다른 화면에서 수정되었습니다. 새로고침 후 다시 시도해 주세요."
        : /RATE_LIMIT/.test(error.message)
          ? "잠시 후 다시 시도해 주세요."
          : "저장하지 못했습니다. 중복·연결된 자료·입력값을 확인해 주세요.",
  );
}
