export function safeNext(value: string | null) {
  return value &&
    /^\/(?!\/)/.test(value) &&
    !value.includes("\\") &&
    !/[\r\n]/.test(value)
    ? value
    : "/wines";
}
export function sameOrigin(origin: string | null, appUrl: string) {
  try {
    return !!origin && new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
export function identityKey(name: string, producer: string | null) {
  return [name, producer ?? ""]
    .map((s) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase())
    .join("|");
}
