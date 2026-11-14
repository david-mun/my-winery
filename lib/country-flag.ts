// Resolve both display languages used by the import and wine catalogue.
const names = new Map<string, string>();
const locales = ["ko", "en"].map(
  (locale) =>
    new Intl.DisplayNames(locale, { type: "region", fallback: "none" }),
);
const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, "");
for (const first of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  for (const last of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const code = first + last;
    if (code === "ZZ") continue;
    for (const locale of locales) {
      const name = locale.of(code);
      if (name) {
        names.set(normalize(name), code);
        names.set(normalize(code), code);
      }
    }
  }
}
for (const [alias, code] of Object.entries({
  한국: "KR",
  남아공: "ZA",
  호주: "AU",
  usa: "US",
  uk: "GB",
}))
  names.set(alias, code);

export function countryFlag(country?: string | null) {
  const code = names.get(normalize(country ?? ""));
  return code
    ? String.fromCodePoint(
        ...Array.from(code, (c) => 0x1f1e6 + c.charCodeAt(0) - 65),
      )
    : "";
}
