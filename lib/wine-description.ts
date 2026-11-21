// Hide only the application's old generated metadata; preserve user-written prose.
const vintageMetadata = /^\s*사진 빈티지:/;
export function visibleDescription(description?: string | null) {
  return (description ?? "")
    .split(/\r?\n/)
    .filter((line) => !vintageMetadata.test(line))
    .join("\n")
    .trim();
}
export function preserveDescriptionMetadata(
  description: string | null,
  previous?: string | null,
) {
  const hidden = (previous ?? "")
    .split(/\r?\n/)
    .filter((line) => vintageMetadata.test(line));
  return [description, ...hidden].filter(Boolean).join("\n") || null;
}
