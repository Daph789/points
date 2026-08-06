(function () {
  const nav = document.getElementById("donos-static-nav");
  if (!nav) return;

  const current = (window.location.pathname.split("/").pop() || "home.html").toLowerCase();
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
    const badge = nav.querySelector("[data-nav-badge='historial']");
    if (!badge || !window.supabase || !window.supabase.createClient) return;

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
      const count = Number(data?.counts?.sections?.historial || 0);
      if (count > 0) {
        badge.textContent = `+${count > 9 ? "9" : count}`;
        badge.classList.add("is-visible");
      } else {
        badge.classList.remove("is-visible");
      }
    } catch (_error) {
      badge.classList.remove("is-visible");
    }
  }

  window.addEventListener("load", () => {
    (window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1400)))(hydrateNotificationBadge);
  }, { once: true });
})();
