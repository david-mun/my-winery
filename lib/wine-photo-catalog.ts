// Only use explicitly marked CC0 or CC BY files. The server verifies Commons
// metadata again by page ID at import; never fetch an arbitrary client URL.
import { z } from "zod";
const value = z.object({ value: z.string() }).optional();
const page = z.object({
  pageid: z.number().int().positive(),
  title: z.string(),
  imageinfo: z.array(
    z.object({
      url: z.string(),
      thumburl: z.string().optional(),
      mime: z.string(),
      extmetadata: z.object({
        LicenseShortName: value,
        LicenseUrl: value,
        Artist: value,
      }),
    }),
  ),
});
export type WinePhotoHit = {
  id: number;
  title: string;
  url: string;
  page: string;
  license: string;
  licenseUrl: string;
  author: string;
};
export function winePhotoHits(data: unknown): WinePhotoHit[] {
  const result = z
    .object({
      query: z.object({ pages: z.array(z.unknown()) }).optional(),
      error: z.unknown().optional(),
    })
    .parse(data);
  if (result.error) throw Error("이미지 검색이 지연되고 있습니다.");
  return (result.query?.pages ?? []).flatMap((raw) => {
    const parsed = page.safeParse(raw);
    if (!parsed.success) return [];
    const { pageid, title, imageinfo } = parsed.data,
      info = imageinfo[0];
    if (!info) return [];
    const meta = info.extmetadata,
      licenseUrl = meta.LicenseUrl?.value
        ?.replace(/^http:/, "https:")
        .replace(/\/deed\.[a-z_-]+$/i, "/")
        .replace(/\/?$/, "/");
    if (
      !licenseUrl ||
      !/^https:\/\/creativecommons\.org\/(?:publicdomain\/zero\/1\.0|licenses\/by\/(?:2\.0|2\.5|3\.0|4\.0))\/$/.test(
        licenseUrl,
      )
    )
      return [];
    const license = meta.LicenseShortName?.value ?? "",
      author = (meta.Artist?.value ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .trim();
    if (
      !/^(CC BY (?:2\.0|2\.5|3\.0|4\.0)|CC0(?: 1\.0)?)$/i.test(license) ||
      (!author && !license.startsWith("CC0")) ||
      !/^image\/(jpeg|png|webp)$/.test(info.mime)
    )
      return [];
    const allowed = (s: string) => {
      try {
        const u = new URL(s);
        return (
          u.protocol === "https:" &&
          !u.port &&
          !u.username &&
          !u.password &&
          ((u.hostname === "upload.wikimedia.org" &&
            u.pathname.startsWith("/wikipedia/commons/")) ||
            u.hostname === "thumb.wikimedia.org")
        );
      } catch {
        return false;
      }
    };
    const url =
      info.thumburl && allowed(info.thumburl) ? info.thumburl : info.url;
    if (!allowed(url)) return [];
    return [
      {
        id: pageid,
        title: title.replace(/^File:/, ""),
        page: "https://commons.wikimedia.org/?curid=" + pageid,
        url,
        license,
        licenseUrl,
        author: author.slice(0, 500),
      },
    ];
  });
}
export async function commonsPhotos(
  target: { q: string } | { id: number },
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "500",
    iiextmetadatafilter: "Artist|LicenseUrl|LicenseShortName",
  });
  if ("q" in target) {
    params.set("generator", "search");
    params.set("gsrnamespace", "6");
    params.set("gsrlimit", "12");
    params.set(
      "gsrsearch",
      target.q
        .slice(0, 200)
        .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
        .trim() + " wine",
    );
  } else params.set("pageids", String(target.id));
  const res = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
  });
  if (!res.ok) throw Error("외부 사진 검색을 사용할 수 없습니다.");
  return winePhotoHits(await res.json());
}
