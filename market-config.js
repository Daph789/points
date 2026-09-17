(function () {
  const countries = [
    {
      code: "ES",
      name: "España",
      flag: "🇪🇸",
      dialCode: "+34",
      phonePlaceholder: "600 000 000",
      defaultCity: "donostia",
    },
    {
      code: "FR",
      name: "France",
      flag: "🇫🇷",
      dialCode: "+33",
      phonePlaceholder: "6 00 00 00 00",
      defaultCity: "lille",
    },
    {
      code: "BE",
      name: "Belgique",
      flag: "🇧🇪",
      dialCode: "+32",
      phonePlaceholder: "470 00 00 00",
      defaultCity: "tournai",
    },
  ];

  const marketsByCountry = {
    ES: [{ id: "donostia", label: "Donostia / San Sebastián" }],
    FR: [{ id: "lille", label: "Lille" }],
    BE: [{ id: "tournai", label: "Tournai" }],
  };

  function getCountry(code) {
    return countries.find((country) => country.code === code) || countries[0];
  }

  function getMarkets(code) {
    return marketsByCountry[getCountry(code).code] || marketsByCountry.ES;
  }

  function getMarket(code, marketId) {
    const country = getCountry(code);
    const markets = getMarkets(country.code);
    return markets.find((market) => market.id === marketId) || markets[0];
  }

  window.donossMarkets = {
    countries,
    marketsByCountry,
    defaultCountryCode: "ES",
    customCityValue: "__custom_city__",
    getCountry,
    getMarkets,
    getMarket,
  };
})();
