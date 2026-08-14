(function () {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("embedded") === "1") return;

  const sessionKeyName = "donossActivitySession";
  const startedAt = Date.now();
  const pageFromLocation = () => {
    const path = window.location.pathname.split("/").pop() || "index.html";
    if (path === "index.html" || path === "") return "landing";
    if (path === "app.html") return `app:${window.location.hash.replace("#", "") || "inicio"}`;
    return path.replace(".html", "") || "unknown";
  };

  function sessionKey() {
    try {
      let key = window.localStorage.getItem(sessionKeyName);
      if (!key) {
        key = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(sessionKeyName, key);
      }
      return key;
    } catch {
      return "";
    }
  }

  async function authToken() {
    if (!window.supabase?.createClient) return "";
    try {
      const client = window.__donossActivityClient || window.supabase.createClient(
        "https://pwpvdpajkaljibytboka.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cHZkcGFqa2FsamlieXRib2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDMwNzcsImV4cCI6MjEwMDkxOTA3N30.nfuO7qVK90WtmrTuTG8aAfUCOxnZdWysAl1cOyVxcA0"
      );
      window.__donossActivityClient = client;
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    } catch {
      return "";
    }
  }

  async function track(reason) {
    const page = pageFromLocation();
    const token = await authToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      await fetch("/api/analytics/track", {
        method: "POST",
        headers,
        body: JSON.stringify({
          page,
          source: page === "landing" ? "landing" : "app",
          sessionKey: sessionKey(),
          metadata: {
            reason,
            hash: window.location.hash || "",
            path: window.location.pathname || "",
            visible_seconds: Math.round((Date.now() - startedAt) / 1000),
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
        keepalive: true,
      });
    } catch {
      // Analytics must never block the app.
    }
  }

  let lastPage = pageFromLocation();
  function trackRouteIfChanged(reason) {
    window.setTimeout(() => {
      const current = pageFromLocation();
      if (current !== lastPage) {
        lastPage = current;
        track(reason);
      }
    }, 0);
  }

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      trackRouteIfChanged(method);
      return result;
    };
  });

  track("load");
  window.addEventListener("hashchange", () => trackRouteIfChanged("hash"));
  window.addEventListener("popstate", () => trackRouteIfChanged("pop"));
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") track("hidden");
  });
  window.addEventListener("pagehide", () => track("pagehide"));
  window.setInterval(() => {
    if (document.visibilityState === "visible") track("heartbeat");
  }, 45000);
})();
