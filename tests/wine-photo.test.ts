import { expect, it } from "vitest";
import { winePhotoHits } from "../lib/wine-photo-catalog";
it("offers only supported, explicitly licensed Commons photographs with credible location and attribution", () => {
  const meta = {
    LicenseShortName: { value: "CC BY 4.0" },
    Artist: { value: "<b>Example</b>" },
    LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
  };
  const info = {
    mime: "image/jpeg",
    url: "https://upload.wikimedia.org/wikipedia/commons/1/12/Wine.jpg",
    extmetadata: meta,
  };
  const rows = [
    info,
    { ...info, url: "https://example.org/image.jpg" },
    { ...info, extmetadata: { ...meta, Artist: { value: "" } } },
    {
      ...info,
      extmetadata: {
        ...meta,
        LicenseShortName: { value: "All rights reserved" },
      },
    },
  ];
  const hits = winePhotoHits({
    query: {
      pages: rows.map((im, i) => ({
        pageid: i + 1,
        title: "File:Bottle.jpg",
        imageinfo: [im],
      })),
    },
  });
  expect(hits.map((h) => [h.id, h.author])).toEqual([[1, "Example"]]);
});
