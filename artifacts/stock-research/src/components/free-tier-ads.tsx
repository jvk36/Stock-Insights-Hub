import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMembership } from "@/lib/membership";
import { canShowAds, isAdContentPage } from "@/lib/adsense-eligibility";

const SCRIPT_ID = "free-tier-adsense";

/**
 * Auto Ads is document-scoped. Removing its script cannot undo injected ads or
 * stop its timers, so leave the document on any transition out of ad eligibility.
 * The next document checks membership before loading Google again.
 */
export function FreeTierAds() {
  const { membership, loading, authState } = useMembership();
  const [path] = useLocation();
  const loaded = useRef(false);
  const enabled = import.meta.env.PROD
    && canShowAds(authState, loading, membership)
    && isAdContentPage(path);

  useEffect(() => {
    if (!enabled) {
      if (loaded.current) window.location.reload();
      return;
    }
    if (loaded.current) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0681600473886225";
    script.crossOrigin = "anonymous";
    loaded.current = true;
    document.head.appendChild(script);
  }, [enabled]);

  return null;
}
