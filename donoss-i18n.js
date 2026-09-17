(function () {
  const copy = {
    es: {
      nav: { inicio: "Inicio", historial: "Historial", quedar: "Quedar", transfer: "Transf.", perfil: "Perfil" },
      categories: {
        Libros: "Libros",
        Cine: "Cine",
        Festivales: "Festivales",
        Conciertos: "Conciertos",
        Museos: "Museos",
        Gaming: "Gaming",
        "Música": "Música",
        Viajes: "Viajes",
        Restaurantes: "Restaurantes",
      },
      common: {
        back: "Volver",
        refresh: "Actualizar",
        close: "Cerrar",
        loadingOffers: "Cargando ofertas...",
        noOffersIn: "Todavía no hay ofertas en {category}.",
        seeDetails: "Ver detalles",
        soldOut: "Oferta agotada",
        viewSoldOut: "Ver agotado",
        buy: "Comprar",
        buyNow: "Comprar ahora",
        preparing: "Preparando...",
        externalPayment: "Continuar al pago externo",
        points: "puntos",
        category: "Categoría",
        description: "Descripción",
        additionalInfo: "Información adicional",
        usefulDetails: "Detalles útiles antes de comprar.",
        eventActivity: "Evento / actividad",
        purchaseUntil: "Compra disponible hasta",
        age: "Edad",
        hours: "Horarios",
      },
      home: {
        section: "Inicio",
        nearby: "Cerca de ti",
        hero: "Aprovechar actividades culturales",
        myPosts: "Mis publicaciones",
        validateQr: "Validar QR",
        create: "Crear",
        seeMore: "Ver más",
        categoryTitle: "Categoría",
        feed: "Feed",
        featured: "Chollos destacados",
        new: "Nuevo",
        emptyFeatured: "Todavía no hay chollos destacados reales. Cuando una empresa publique ofertas, aparecerá una selección variada aquí.",
        balance: "Saldo Donoss",
        donosId: "ID Donoss",
        copy: "Copiar",
        copied: "Copiado",
        company: "Soy Empresa",
      },
      business: {
        company: "Empresa Donoss",
        yourCompany: "Tu empresa",
        follow: "Seguir",
        following: "Siguiendo",
        posts: "Posts",
        likes: "Likes",
        followers: "Abonados",
        bio: "Bio",
        emptyBio: "Esta empresa todavía no ha añadido una bio.",
        officialOffers: "Ofertas oficiales",
        publications: "Publicaciones",
        emptyPosts: "Esta empresa todavía no tiene publicaciones visibles.",
      },
      checkout: {
        securePayment: "Pago seguro",
        externalPayment: "Pago externo",
        redirectReady: "Redirección preparada",
        paymentDone: "Pago realizado",
        externalReady: "Enlace externo preparado",
        completed: "Compra completada",
        product: "Producto",
        delivery: "Entrega",
      },
      publish: {
        cover: "Foto de portada",
        title: "Título",
        presentationImages: "Imágenes de presentación",
        address: "Dirección",
        category: "Categoría",
        basePrice: "Precio de base",
        reducedPrice: "Precio reducido",
        pointsForDiscount: "{points} puntos para obtener el precio reducido",
        pointsCalc: "Cálculo automático: 1 punto = 0,01 €.",
        hours: "Horarios",
        eventDate: "Fecha del evento / inicio de la actividad",
        purchaseEnd: "Último día para comprar",
        purchaseEndTitle: "Último día para comprar = cierre de ventas",
        qrScan: "Escaneo del QR del billete",
        qrNoExpiry: "Este producto no caduca",
        qrNoExpiryHint: "El QR no tendrá fecha final.",
        qrFrom: "QR escaneable desde",
        qrUntil: "QR escaneable hasta",
        stock: "Stock disponible",
        age: "Edad",
        author: "Autor/a",
        description: "Descripción",
        actionButton: "Botón de acción",
      },
    },
    fr: {
      nav: { inicio: "Accueil", historial: "Historique", quedar: "Plans", transfer: "Transf.", perfil: "Profil" },
      categories: {
        Libros: "Livres",
        Cine: "Cinéma",
        Festivales: "Festivals",
        Conciertos: "Concerts",
        Museos: "Musées",
        Gaming: "Gaming",
        "Música": "Musique",
        Viajes: "Voyages",
        Restaurantes: "Restaurants",
      },
      common: {
        back: "Retour",
        refresh: "Actualiser",
        close: "Fermer",
        loadingOffers: "Chargement des offres...",
        noOffersIn: "Il n’y a pas encore d’offres dans {category}.",
        seeDetails: "Voir détails",
        soldOut: "Offre épuisée",
        viewSoldOut: "Voir épuisé",
        buy: "Acheter",
        buyNow: "Acheter maintenant",
        preparing: "Préparation...",
        externalPayment: "Continuer vers le paiement externe",
        points: "points",
        category: "Catégorie",
        description: "Description",
        additionalInfo: "Informations supplémentaires",
        usefulDetails: "Détails utiles avant d’acheter.",
        eventActivity: "Événement / activité",
        purchaseUntil: "Achat disponible jusqu’au",
        age: "Âge",
        hours: "Horaires",
      },
      home: {
        section: "Accueil",
        nearby: "Près de toi",
        hero: "Profiter d’activités culturelles",
        myPosts: "Mes publications",
        validateQr: "Valider QR",
        create: "Créer",
        seeMore: "Voir plus",
        categoryTitle: "Catégorie",
        feed: "Feed",
        featured: "Bons plans à la une",
        new: "Nouveau",
        emptyFeatured: "Il n’y a pas encore de bons plans à la une. Quand une entreprise publiera des offres, une sélection apparaîtra ici.",
        balance: "Solde Donoss",
        donosId: "ID Donoss",
        copy: "Copier",
        copied: "Copié",
        company: "Entreprise",
      },
      business: {
        company: "Entreprise Donoss",
        yourCompany: "Ton entreprise",
        follow: "Suivre",
        following: "Abonné",
        posts: "Publications",
        likes: "Likes",
        followers: "Abonnés",
        bio: "Bio",
        emptyBio: "Cette entreprise n’a pas encore ajouté de bio.",
        officialOffers: "Offres officielles",
        publications: "Publications",
        emptyPosts: "Cette entreprise n’a pas encore de publications visibles.",
      },
      checkout: {
        securePayment: "Paiement sécurisé",
        externalPayment: "Paiement externe",
        redirectReady: "Redirection prête",
        paymentDone: "Paiement réalisé",
        externalReady: "Lien externe prêt",
        completed: "Achat terminé",
        product: "Produit",
        delivery: "Remise",
      },
      publish: {
        cover: "Photo de couverture",
        title: "Titre",
        presentationImages: "Images de présentation",
        address: "Adresse",
        category: "Catégorie",
        basePrice: "Prix de base",
        reducedPrice: "Prix réduit",
        pointsForDiscount: "{points} points pour obtenir le prix réduit",
        pointsCalc: "Calcul automatique : 1 point = 0,01 €.",
        hours: "Horaires",
        eventDate: "Date de l’événement / début de l’activité",
        purchaseEnd: "Dernier jour pour acheter",
        purchaseEndTitle: "Dernier jour pour acheter = fermeture des ventes",
        qrScan: "Scan du QR du billet",
        qrNoExpiry: "Ce produit n’expire pas",
        qrNoExpiryHint: "Le QR n’aura pas de date de fin.",
        qrFrom: "QR scannable dès",
        qrUntil: "QR scannable jusqu’au",
        stock: "Stock disponible",
        age: "Âge",
        author: "Auteur/autrice",
        description: "Description",
        actionButton: "Bouton d’action",
      },
    },
  };

  function localeFromCountry(countryCode) {
    return ["FR", "BE"].includes(String(countryCode || "").toUpperCase()) ? "fr" : "es";
  }

  function getLocale() {
    return localStorage.getItem("donossLocale") || localeFromCountry(localStorage.getItem("donossCountryCode")) || "es";
  }

  function setCountry(countryCode) {
    const code = String(countryCode || "").toUpperCase();
    if (code) localStorage.setItem("donossCountryCode", code);
    localStorage.setItem("donossLocale", localeFromCountry(code));
  }

  function t(path, replacements = {}) {
    const locale = getLocale();
    const parts = String(path || "").split(".");
    let value = copy[locale] || copy.es;
    for (const part of parts) value = value?.[part];
    if (typeof value !== "string") {
      value = copy.es;
      for (const part of parts) value = value?.[part];
    }
    return String(value || path).replace(/\{(\w+)\}/g, (_, key) => replacements[key] ?? "");
  }

  function category(value) {
    return copy[getLocale()]?.categories?.[value] || copy.es.categories[value] || value;
  }

  function applyStaticNav(root = document) {
    const labels = copy[getLocale()]?.nav || copy.es.nav;
    root.querySelectorAll("[data-route]").forEach((item) => {
      const route = item.dataset.route;
      const label = labels[route];
      const span = item.querySelector("span:last-child");
      if (label && span) span.textContent = label;
      if (label) item.setAttribute("aria-label", label);
    });
  }

  window.donossI18n = { t, category, getLocale, setCountry, localeFromCountry, applyStaticNav };
  document.addEventListener("DOMContentLoaded", () => applyStaticNav());
})();
