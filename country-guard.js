(function () {
  const allowedCountry = "ES";
  const cacheKey = "donossCountryCheck";
  const cacheMaxAge = 6 * 60 * 60 * 1000;
  const blockedPage = "country-unavailable.html";
  const spainTimezones = new Set(["Europe/Madrid", "Atlantic/Canary", "Africa/Ceuta"]);

  function isBlockedPage() {
    return window.location.pathname.endsWith(blockedPage);
  }

  function redirectBlocked(country) {
    if (isBlockedPage()) return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`${blockedPage}?country=${encodeURIComponent(country || "unknown")}&next=${encodeURIComponent(current)}`);
  }

  function readCache() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (!parsed || Date.now() - Number(parsed.checked_at || 0) > cacheMaxAge) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeCache(country, source) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ country, source, checked_at: Date.now() }));
    } catch (_error) {
      // Storage can be unavailable in some private browsers.
    }
  }

  async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2600);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function detectCountry() {
    const cached = readCache();
    if (cached?.country) return cached;

    try {
      const data = await fetchWithTimeout("https://ipapi.co/json/");
      const country = String(data?.country_code || "").toUpperCase();
      if (country) {
        writeCache(country, "ipapi");
        return { country, source: "ipapi" };
      }
    } catch (_error) {
      // Try the second provider below.
    }

    try {
      const data = await fetchWithTimeout("https://ipwho.is/");
      const country = String(data?.country_code || "").toUpperCase();
      if (country) {
        writeCache(country, "ipwho");
        return { country, source: "ipwho" };
      }
    } catch (_error) {
      // Fallback below.
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (spainTimezones.has(timezone)) {
      writeCache(allowedCountry, "timezone");
      return { country: allowedCountry, source: "timezone" };
    }

    return { country: "", source: "unknown" };
  }

  async function requireSpainAccess() {
    const result = await detectCountry();
    if (result.country && result.country !== allowedCountry) {
      redirectBlocked(result.country);
      return false;
    }
    return true;
  }

  window.donossCountryGuard = {
    detectCountry,
    requireSpainAccess,
  };

  if (document.documentElement.dataset.countryGuard === "auth") {
    requireSpainAccess();
  }
})();
