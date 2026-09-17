import { useEffect } from "react";

const SITE_URL = "https://diyabsolutereturns.com";
const SITE_NAME = "DIY Absolute Returns";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  schema?: Record<string, unknown>;
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

export default function Seo({ title, description, path, type = "website", schema }: SeoProps) {
  useEffect(() => {
    const canonicalUrl = new URL(path, SITE_URL).toString();
    const imageUrl = `${SITE_URL}/opengraph.jpg`;
    document.title = title;

    setMeta('meta[name="description"]', { name: "description", content: description });
    setMeta('meta[name="robots"]', { name: "robots", content: "index, follow" });
    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[property="og:description"]', { property: "og:description", content: description });
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    setMeta('meta[property="og:type"]', { property: "og:type", content: type });
    setMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
    setMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
    setMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: imageUrl });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const scriptId = "page-structured-data";
    document.getElementById(scriptId)?.remove();
    if (schema) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.text = JSON.stringify({ "@context": "https://schema.org", ...schema, url: canonicalUrl });
      document.head.appendChild(script);
    }
  }, [description, path, schema, title, type]);

  return null;
}