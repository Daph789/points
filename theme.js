(function () {
  const STORAGE_KEY = "donossTheme";
  const THEMES = new Set(["dark", "light"]);

  function normalizeTheme(theme) {
    return THEMES.has(theme) ? theme : "dark";
  }

  function getTheme() {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY) || "dark");
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme || getTheme());
    document.documentElement.dataset.theme = nextTheme;
    if (document.body) document.body.dataset.theme = nextTheme;
    return nextTheme;
  }

  function notifyTheme(theme) {
    window.dispatchEvent(new CustomEvent("donoss:theme-changed", { detail: { theme } }));
  }

  function setTheme(theme, options = {}) {
    const nextTheme = applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    notifyTheme(nextTheme);
    if (!options.silentParent && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: "donos:theme", theme: nextTheme }, window.location.origin);
      } catch (_error) {}
    }
    return nextTheme;
  }

  function toggleTheme() {
    return setTheme(getTheme() === "light" ? "dark" : "light");
  }

  window.donossTheme = {
    key: STORAGE_KEY,
    getTheme,
    applyTheme,
    setTheme,
    toggleTheme,
  };

  applyTheme();

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const nextTheme = applyTheme(event.newValue);
      notifyTheme(nextTheme);
    }
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === "donos:theme-apply") {
      setTheme(event.data.theme, { silentParent: true });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyTheme());
  }
})();
