import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Wine List",
    short_name: "My Wine List",
    description: "나만의 비공개 와인 기록",
    start_url: "/wines",
    display: "standalone",
    background_color: "#f8f7f4",
    theme_color: "#733c4c",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
