import { useEffect } from "react";
import { siteConfig } from "@/lib/siteConfig";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath?: string;
  noIndex?: boolean;
  ogType?: "website" | "article";
  structuredData?: Record<string, unknown>;
};

const SITE_NAME = siteConfig.siteName;
const DEFAULT_IMAGE = "https://storage.googleapis.com/gpt-engineer-file-uploads/qvvrk4xtK7bKOCDAmKZqQKASV1H3/social-images/social-1767914053483-LWrite-Logo.png";

const STRUCTURED_DATA_ID = "ldoc-structured-data";

const upsertMeta = (selector: string, attributes: Record<string, string>) => {
  const head = document.head;
  let element = head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

const upsertLink = (selector: string, attributes: Record<string, string>) => {
  const head = document.head;
  let element = head.querySelector<HTMLLinkElement>(selector);

  if (!element) {
    element = document.createElement("link");
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

const upsertJsonLd = (id: string, data: Record<string, unknown>) => {
  const head = document.head;
  let script = head.querySelector<HTMLScriptElement>(`script#${id}`);

  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
};

export const useSEO = ({
  title,
  description,
  canonicalPath = "/",
  noIndex = false,
  ogType = "website",
  structuredData,
}: SeoConfig) => {
  useEffect(() => {
    // Resolve against the configured public site URL so the canonical/og:url
    // reflect the documented domain even on preview or alternate-origin
    // deployments. `siteConfig.siteUrl` falls back to the current origin when
    // unconfigured, preserving previous behaviour for the default deployment.
    const canonicalUrl = new URL(canonicalPath, siteConfig.siteUrl).toString();

    document.title = title;

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: noIndex ? "noindex,nofollow" : "index,follow",
    });

    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: ogType });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_IMAGE });

    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_IMAGE });

    upsertLink('link[rel="canonical"]', { rel: "canonical", href: canonicalUrl });

    if (structuredData) {
      upsertJsonLd(STRUCTURED_DATA_ID, structuredData);
    } else {
      // Pages without their own structured data (e.g. the legal pages) must not
      // inherit a previous route's JSON-LD during SPA navigation, or they would
      // be indexed with stale, page-specific structured data.
      document.head.querySelector(`script#${STRUCTURED_DATA_ID}`)?.remove();
    }
  }, [canonicalPath, description, noIndex, ogType, structuredData, title]);
};
