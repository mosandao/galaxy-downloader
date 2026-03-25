import type { MetadataRoute } from "next";
import { getMessages } from "next-intl/server";

import { i18n } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/types";
import { localeToHtmlLang } from "@/lib/seo";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const dict = await getMessages({locale: i18n.defaultLocale}) as Dictionary;

  return {
    id: "/",
    name: dict.metadata.siteName,
    short_name: "UM Downloader",
    description: dict.unified.pageDescription,
    lang: localeToHtmlLang(i18n.defaultLocale),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
