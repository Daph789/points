(function () {
  function priceInCents(value) {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return null;
    const cents = Math.round((price + Number.EPSILON) * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  // Derive the label from current prices, including for already-published offers.
  function formatDiscount(basePrice, reducedPrice) {
    const base = priceInCents(basePrice);
    const reduced = priceInCents(reducedPrice);
    if (base === null || reduced === null || base <= 0 || reduced >= base) return null;
    const percent = ((base - reduced) / base) * 100;
    const locale = window.donossI18n?.getLocale?.() === "fr" ? "fr-FR" : "es-ES";
    const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    if (percent < 0.01) return `< ${format.format(0.01)} %`;
    // A paid ticket must never be advertised as a 100% discount after rounding.
    const rounded = Math.min(Math.round(percent * 100) / 100, reduced > 0 ? 99.99 : 100);
    return `−${format.format(rounded)} %`;
  }

  function isFreeTicket(offer) {
    return offer?.is_free === true && !offer.external_checkout_enabled
      && priceInCents(offer.reduced_price) === 0 && priceInCents(offer.required_points) === 0;
  }

  function ticketPriceLabel(offer, suffix = "ptos.") {
    if (isFreeTicket(offer)) return window.donossI18n?.getLocale?.() === "fr" ? "Gratuit" : "Gratis";
    return `${offer.required_points || 0} ${suffix}`;
  }

  window.donossPricing = { formatDiscount, isFreeTicket, ticketPriceLabel };
})();
