(function () {
  const lockedCountries = new Set(["FR", "BE"]);
  const unlockKey = "donossRegionLaunchUnlocked";
  const passwordHash = "f262a01d304ee4608705305f2d0ca0b980be47518909a93449a7b8f8b4f7df42";
  const skippedPages = new Set([
    "login.html",
    "signup.html",
    "country-unavailable.html",
    "privacy-policy.html",
    "data-deletion.html",
    "index.html",
  ]);

  function currentPage() {
    return (window.location.pathname.split("/").pop() || "app.html").toLowerCase();
  }

  function readCountryGuardCache() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem("donossCountryCheck") || "null");
      return String(parsed?.country || "").toUpperCase();
    } catch (_error) {
      return "";
    }
  }

  function countryFromTimezone() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone === "Europe/Paris") return "FR";
    if (timezone === "Europe/Brussels") return "BE";
    return "";
  }

  function detectedCountry() {
    return (
      String(localStorage.getItem("donossCountryCode") || "").toUpperCase() ||
      readCountryGuardCache() ||
      countryFromTimezone()
    );
  }

  function isUnlocked() {
    return localStorage.getItem(unlockKey) === "1";
  }

  function setUnlocked() {
    localStorage.setItem(unlockKey, "1");
  }

  async function sha256Hex(value) {
    if (!window.crypto?.subtle || !window.TextEncoder) return "";
    const bytes = new TextEncoder().encode(String(value || ""));
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function isValidPassword(value) {
    return await sha256Hex(value) === passwordHash;
  }

  function shouldLock() {
    if (isUnlocked()) return false;
    if (skippedPages.has(currentPage())) return false;
    return lockedCountries.has(detectedCountry());
  }

  function injectStyles() {
    if (document.getElementById("donoss-region-lock-style")) return;
    const style = document.createElement("style");
    style.id = "donoss-region-lock-style";
    style.textContent = `
      .donoss-region-lock {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        padding: 22px;
        background:
          radial-gradient(circle at 20% 10%, rgba(66, 242, 179, 0.20), transparent 30%),
          radial-gradient(circle at 85% 20%, rgba(96, 165, 250, 0.16), transparent 28%),
          rgba(5, 7, 17, 0.88);
        -webkit-backdrop-filter: blur(22px);
        backdrop-filter: blur(22px);
      }
      .donoss-region-lock__card {
        width: min(100%, 480px);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 34px;
        background: linear-gradient(180deg, rgba(20, 26, 43, 0.96), rgba(10, 14, 25, 0.98));
        box-shadow: 0 34px 100px rgba(0, 0, 0, 0.48);
        color: #fff;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .donoss-region-lock__body { padding: 26px; }
      .donoss-region-lock__eyebrow {
        margin: 0;
        color: #42f2b3;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .donoss-region-lock__title {
        margin: 12px 0 0;
        font-size: clamp(30px, 8vw, 48px);
        line-height: .98;
        font-weight: 900;
        letter-spacing: 0;
      }
      .donoss-region-lock__text {
        margin: 16px 0 0;
        color: #cbd5e1;
        font-size: 15px;
        line-height: 1.65;
        font-weight: 700;
      }
      .donoss-region-lock__date {
        margin-top: 18px;
        display: inline-flex;
        border: 1px solid rgba(66, 242, 179, .22);
        border-radius: 999px;
        background: rgba(66, 242, 179, .10);
        padding: 10px 14px;
        color: #42f2b3;
        font-size: 13px;
        font-weight: 900;
      }
      .donoss-region-lock__admin {
        margin-top: 22px;
        border-top: 1px solid rgba(255, 255, 255, 0.10);
        padding: 18px 26px 24px;
        background: rgba(255, 255, 255, 0.035);
      }
      .donoss-region-lock__label {
        display: block;
        margin-bottom: 9px;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .12em;
      }
      .donoss-region-lock__row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
      .donoss-region-lock__input {
        min-width: 0;
        height: 48px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        background: rgba(0, 0, 0, 0.24);
        color: #fff;
        padding: 0 14px;
        font: inherit;
        font-size: 15px;
        font-weight: 800;
        outline: none;
      }
      .donoss-region-lock__input:focus {
        border-color: rgba(66, 242, 179, .72);
        box-shadow: 0 0 0 4px rgba(66, 242, 179, .10);
      }
      .donoss-region-lock__button {
        height: 48px;
        border: 0;
        border-radius: 18px;
        background: #42f2b3;
        color: #060914;
        padding: 0 18px;
        font: inherit;
        font-size: 14px;
        font-weight: 900;
        cursor: pointer;
      }
      .donoss-region-lock__error {
        min-height: 20px;
        margin: 10px 0 0;
        color: #ff6b6b;
        font-size: 13px;
        font-weight: 800;
      }
      @media (max-width: 420px) {
        .donoss-region-lock__row { grid-template-columns: 1fr; }
        .donoss-region-lock__button { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeOverlay() {
    document.getElementById("donoss-region-lock")?.remove();
    document.documentElement.classList.remove("donoss-region-locked");
  }

  function showOverlay() {
    if (document.getElementById("donoss-region-lock")) return;
    injectStyles();
    document.documentElement.classList.add("donoss-region-locked");

    const overlay = document.createElement("div");
    overlay.id = "donoss-region-lock";
    overlay.className = "donoss-region-lock";
    overlay.innerHTML = `
      <section class="donoss-region-lock__card" role="dialog" aria-modal="true" aria-labelledby="donoss-region-lock-title">
        <div class="donoss-region-lock__body">
          <p class="donoss-region-lock__eyebrow">Lancement progressif</p>
          <h1 class="donoss-region-lock__title" id="donoss-region-lock-title">Cette app n’est pas encore disponible dans votre région.</h1>
          <p class="donoss-region-lock__text">Donoss arrive très bientôt en France et en Belgique. Revenez le <strong>10 octobre 2026</strong> pour découvrir les offres, les plans et les avantages disponibles près de chez vous.</p>
          <span class="donoss-region-lock__date">Ouverture prévue : 10 octobre 2026</span>
        </div>
        <form class="donoss-region-lock__admin" id="donoss-region-lock-form">
          <label class="donoss-region-lock__label" for="donoss-region-lock-password">Accès administrateur</label>
          <div class="donoss-region-lock__row">
            <input class="donoss-region-lock__input" id="donoss-region-lock-password" type="password" autocomplete="current-password" placeholder="Mot de passe" />
            <button class="donoss-region-lock__button" type="submit">Entrer</button>
          </div>
          <p class="donoss-region-lock__error" id="donoss-region-lock-error"></p>
        </form>
      </section>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#donoss-region-lock-password");
    const error = overlay.querySelector("#donoss-region-lock-error");
    overlay.querySelector("#donoss-region-lock-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (await isValidPassword(input.value)) {
        setUnlocked();
        removeOverlay();
        return;
      }
      error.textContent = "Mot de passe incorrect.";
      input.value = "";
      input.focus();
    });
    window.setTimeout(() => input.focus(), 80);
  }

  async function refreshFromProfile() {
    if (!window.supabase?.createClient) return;
    try {
      const client = window.supabase.createClient(
        "https://pwpvdpajkaljibytboka.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cHZkcGFqa2FsamlieXRib2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDMwNzcsImV4cCI6MjEwMDkxOTA3N30.nfuO7qVK90WtmrTuTG8aAfUCOxnZdWysAl1cOyVxcA0"
      );
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/me/profile", { headers: { Authorization: `Bearer ${token}` } });
      const profileData = await response.json().catch(() => ({}));
      const country = String(profileData?.profile?.country_code || "").toUpperCase();
      if (country) {
        localStorage.setItem("donossCountryCode", country);
        if (window.donossI18n?.setCountry) window.donossI18n.setCountry(country);
      }
    } catch (_error) {}
  }

  async function init() {
    if (isUnlocked() || skippedPages.has(currentPage())) return;
    if (shouldLock()) showOverlay();
    await refreshFromProfile();
    if (shouldLock()) showOverlay();
  }

  window.donossRegionLaunchLock = { init, showOverlay, removeOverlay };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
