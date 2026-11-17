import { handleAnalysis } from "@/lib/analysis/handler";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  req: Request,
  context: { params: Promise<{ task: string }> },
) {
  return handleAnalysis(req, (await context.params).task);
}
