(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embedded") === "1") {
    document.body.classList.add("donos-embedded", "donos-shell-ready");
    const routeByFile = {
      "home.html": "inicio",
      "historial.html": "historial",
      "plans.html": "quedar",
      "transfer.html": "transfer",
      "profile.html": "perfil",
    };
    document.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      const file = url.pathname.split("/").pop();
      const route = routeByFile[file];
      if (window.parent === window) return;
      if (file === "offer-detail.html" && url.searchParams.get("id")) {
        event.preventDefault();
        window.parent.postMessage({ type: "donos:offer-detail", id: url.searchParams.get("id") }, window.location.origin);
        return;
      }
      if (file === "business-profile.html" && url.searchParams.get("id")) {
        event.preventDefault();
        window.parent.postMessage({ type: "donos:business-profile", id: url.searchParams.get("id") }, window.location.origin);
        return;
      }
      if (file === "plan-chat.html" && url.searchParams.get("id")) {
        event.preventDefault();
        window.parent.postMessage({ type: "donos:plan-chat", id: url.searchParams.get("id") }, window.location.origin);
        return;
      }
      if (file === "side-group.html" && url.searchParams.get("id") && url.searchParams.get("status")) {
        event.preventDefault();
        window.parent.postMessage({ type: "donos:side-group", id: url.searchParams.get("id"), status: url.searchParams.get("status") }, window.location.origin);
        return;
      }
      if (!route) {
        if (url.origin === window.location.origin && file.endsWith(".html")) {
          event.preventDefault();
          window.parent.location.href = url.href;
        }
        return;
      }
      event.preventDefault();
      window.parent.postMessage({ type: "donos:navigate", route }, window.location.origin);
    }, { capture: true });
    window.addEventListener("load", () => {
      const file = window.location.pathname.split("/").pop();
      if (file === "login.html" && window.parent !== window) {
        window.parent.location.href = window.location.href.replace(/[?&]embedded=1\b/, "");
      }
    }, { once: true });
    return;
  }

  const nav = document.getElementById("donos-static-nav");
  if (!nav) return;

  const current = (window.location.pathname.split("/").pop() || "home.html").toLowerCase();
  const loader = document.querySelector(".donos-page-loader");
  const visitedKey = `donos-visited-${current}`;
  if (window.sessionStorage?.getItem(visitedKey)) {
    loader?.classList.add("is-skipped");
    document.body.classList.add("donos-shell-ready");
  } else {
    window.sessionStorage?.setItem(visitedKey, "1");
  }

  const items = Array.from(nav.querySelectorAll("a[href]"));
  const hrefs = items.map((item) => item.getAttribute("href"));
  const grid = nav.querySelector(".donos-static-nav__grid");
  let activeIndex = 0;

  items.forEach((item, index) => {
    const href = (item.getAttribute("href") || "").toLowerCase();
    if (href === current || (current === "" && href === "home.html")) {
      item.classList.add("is-active");
      item.setAttribute("aria-current", "page");
      activeIndex = index;
    } else {
      item.classList.remove("is-active");
      item.removeAttribute("aria-current");
    }
  });

  nav.dataset.activeIndex = String(activeIndex);
  grid?.style.setProperty("--nav-index", String(activeIndex));
  window.requestAnimationFrame(() => {
    nav.classList.add("is-ready");
    grid?.style.setProperty("--nav-index", String(activeIndex));
  });

  function prefetchOne(href) {
    if (!href || document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    document.head.appendChild(link);
  }

  items.forEach((item) => {
    const href = item.getAttribute("href");
    item.addEventListener("pointerenter", () => prefetchOne(href), { passive: true });
    item.addEventListener("touchstart", () => prefetchOne(href), { passive: true });
  });

  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && hrefs.includes(url.pathname.split("/").pop())) {
      const targetIndex = items.indexOf(link);
      if (targetIndex >= 0) {
        grid?.style.setProperty("--nav-index", String(targetIndex));
      }
      document.body.classList.add("donos-app-leaving");
    }
  });

  function markShellReady() {
    if (loader?.classList.contains("is-skipped")) return;
    window.setTimeout(() => document.body.classList.add("donos-shell-ready"), 120);
  }

  const root = document.getElementById("root");
  if (root?.children?.length) {
    markShellReady();
  } else if (root) {
    const observer = new MutationObserver(() => {
      if (!root.children.length) return;
      observer.disconnect();
      markShellReady();
    });
    observer.observe(root, { childList: true });
    window.setTimeout(markShellReady, 1800);
  } else {
    window.addEventListener("load", markShellReady, { once: true });
  }

  async function hydrateNotificationBadge() {
    const badges = Array.from(nav.querySelectorAll("[data-nav-badge]"));
    if (badges.length === 0 || !window.supabase || !window.supabase.createClient) return;

    const supabaseUrl = "https://pwpvdpajkaljibytboka.supabase.co";
    const supabaseAnonKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cHZkcGFqa2FsamlieXRib2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDMwNzcsImV4cCI6MjEwMDkxOTA3N30.nfuO7qVK90WtmrTuTG8aAfUCOxnZdWysAl1cOyVxcA0";
    try {
      const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      const { data: auth } = await client.auth.getSession();
      const token = auth?.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/me/notifications", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      badges.forEach((badge) => {
        const section = badge.dataset.navBadge;
        const count = Number(data?.counts?.sections?.[section] || 0);
        if (count > 0) {
          badge.textContent = `+${count > 9 ? "9" : count}`;
          badge.classList.add("is-visible");
        } else {
          badge.classList.remove("is-visible");
        }
      });
    } catch (_error) {
      badges.forEach((badge) => badge.classList.remove("is-visible"));
    }
  }

  window.addEventListener("load", () => {
    (window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1400)))(hydrateNotificationBadge);
  }, { once: true });
})();
