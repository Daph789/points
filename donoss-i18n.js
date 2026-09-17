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

  const phraseCopy = {
    fr: {
      "Inicio": "Accueil",
      "Historial": "Historique",
      "Quedar": "Plans",
      "Transferencias": "Transferts",
      "Perfil": "Profil",
      "Volver": "Retour",
      "Actualizar": "Actualiser",
      "Cerrar": "Fermer",
      "Navegación principal": "Navigation principale",
      "Crear": "Créer",
      "Guardar": "Enregistrer",
      "Guardar cambios": "Enregistrer les changements",
      "Guardando...": "Enregistrement...",
      "Preparando...": "Préparation...",
      "Procesando...": "Traitement...",
      "Eliminar": "Supprimer",
      "Editar": "Modifier",
      "Ver": "Voir",
      "Mostrar": "Afficher",
      "Ocultar": "Masquer",
      "Comprar": "Acheter",
      "Pagar": "Payer",
      "Buscar": "Rechercher",
      "Entrar": "Se connecter",
      "Crear cuenta": "Créer un compte",
      "Crear cuenta gratis": "Créer un compte gratuit",
      "Cancelar": "Annuler",
      "Modificar": "Modifier",
      "Actualizar app": "Mettre à jour l’app",
      "Mis publicaciones": "Mes publications",
      "Panel empresa": "Espace entreprise",
      "Crear una publicación": "Créer une publication",
      "Caducadas": "Expirées",
      "Billetes y ofertas fuera de fecha": "Billets et offres hors date",
      "Ya no aparecen para los jóvenes. Puedes modificarlas, ocultarlas o eliminarlas.": "Elles n’apparaissent plus pour les jeunes. Tu peux les modifier, les masquer ou les supprimer.",
      "Stock crítico": "Stock critique",
      "Productos a revisar": "Produits à vérifier",
      "Filtra los productos agotados o con pocas unidades disponibles.": "Filtre les produits épuisés ou avec peu d’unités disponibles.",
      "Agotado": "Épuisé",
      "Caducada": "Expirée",
      "Oculta": "Masquée",
      "Sin categoría": "Sans catégorie",
      "Oferta sin título": "Offre sans titre",
      "Dirección no indicada": "Adresse non indiquée",
      "Ruptura de stock": "Rupture de stock",
      "Editar stock": "Modifier le stock",
      "Transferir": "Transférer",
      "Transferir publicación": "Transférer la publication",
      "Confirmar transferencia": "Confirmer le transfert",
      "Cargando empresas...": "Chargement des entreprises...",
      "No hay empresas con esta búsqueda.": "Aucune entreprise avec cette recherche.",
      "Buscar empresa, email, ID Donoss, barrio...": "Rechercher entreprise, e-mail, ID Donoss, quartier...",
      "Buscar por título, categoría, dirección...": "Rechercher par titre, catégorie, adresse...",
      "Cargando publicaciones...": "Chargement des publications...",
      "Todavía no has publicado ninguna oferta.": "Tu n’as encore publié aucune offre.",
      "Esta zona es solo para cuentas empresa.": "Cette zone est réservée aux comptes entreprise.",
      "No se han podido cargar tus publicaciones.": "Impossible de charger tes publications.",
      "Publicación ocultada correctamente.": "Publication masquée correctement.",
      "Publicación visible de nuevo.": "Publication de nouveau visible.",
      "Publicación eliminada definitivamente.": "Publication supprimée définitivement.",
      "Perfil": "Profil",
      "Cargando perfil...": "Chargement du profil...",
      "Cuenta Donoss": "Compte Donoss",
      "Cuenta certificada": "Compte certifié",
      "Empresa": "Entreprise",
      "España": "Espagne",
      "Correo no indicado": "E-mail non indiqué",
      "ID no disponible": "ID non disponible",
      "Copiar": "Copier",
      "Copiado": "Copié",
      "Nombre / Apodo": "Nom / pseudo",
      "Tu nombre o apodo": "Ton nom ou pseudo",
      "Tu cuenta": "Ton compte",
      "Puntos": "Points",
      "Bio de la empresa": "Bio de l’entreprise",
      "Bio personal": "Bio personnelle",
      "Todavía no has añadido una bio.": "Tu n’as pas encore ajouté de bio.",
      "Ej. Somos una librería de Gros que organiza planes culturales, descuentos para jóvenes y eventos cerca del barrio.": "Ex. Nous sommes une librairie qui organise des plans culturels, des réductions pour les jeunes et des événements près du quartier.",
      "Ej. Soy una persona a la que le gusta mucho la música, el cine y conocer gente para hacer planes por Donostia.": "Ex. J’aime beaucoup la musique, le cinéma et rencontrer des gens pour faire des plans.",
      "Mínimo 20 caracteres.": "Minimum 20 caractères.",
      "Guardar bio": "Enregistrer la bio",
      "Foto de empresa": "Photo de l’entreprise",
      "Se verá en tu página pública de empresa y ayudará a que tus ofertas parezcan más fiables.": "Elle apparaîtra sur ta page publique d’entreprise et rendra tes offres plus fiables.",
      "Añadir foto": "Ajouter une photo",
      "Quitar": "Retirer",
      "Foto de empresa guardada correctamente.": "Photo de l’entreprise enregistrée correctement.",
      "Foto de empresa eliminada.": "Photo de l’entreprise supprimée.",
      "No se ha podido guardar la foto de empresa.": "Impossible d’enregistrer la photo de l’entreprise.",
      "Te invitó": "Invité par",
      "Invitación registrada": "Invitation enregistrée",
      "Tipo de cuenta": "Type de compte",
      "Comercio / Empresa": "Commerce / Entreprise",
      "Usuario": "Utilisateur",
      "Teléfono": "Téléphone",
      "País": "Pays",
      "País y ciudad Donoss": "Pays et ville Donoss",
      "País y ciudad actualizados correctamente.": "Pays et ville mis à jour correctement.",
      "Guardar ciudad": "Enregistrer la ville",
      "Mi ciudad no aparece": "Ma ville n’apparaît pas",
      "Escribe tu ciudad": "Écris ta ville",
      "Ciudad solicitada. Mientras se revisa, verás la ciudad principal de ese país.": "Ville demandée. Pendant la vérification, tu verras la ville principale de ce pays.",
      "Mientras Donoss revisa esa ciudad, verás las publicaciones de la ciudad principal de ese país.": "Pendant que Donoss vérifie cette ville, tu verras les publications de la ville principale de ce pays.",
      "Tu ciudad quedará en revisión. Hasta que se abra, verás la ciudad principal del país seleccionado.": "Ta ville sera en vérification. Jusqu’à son ouverture, tu verras la ville principale du pays sélectionné.",
      "No se ha podido actualizar tu país o ciudad.": "Impossible de mettre à jour ton pays ou ta ville.",
      "Escribe una ciudad válida para pedir su apertura.": "Écris une ville valide pour demander son ouverture.",
      "El nombre debe tener entre 2 y 60 caracteres.": "Le nom doit contenir entre 2 et 60 caractères.",
      "Nombre actualizado correctamente.": "Nom mis à jour correctement.",
      "No se ha podido actualizar tu nombre.": "Impossible de mettre à jour ton nom.",
      "La bio debe tener entre 20 y 500 caracteres.": "La bio doit contenir entre 20 et 500 caractères.",
      "Bio actualizada correctamente.": "Bio mise à jour correctement.",
      "No se ha podido actualizar tu bio.": "Impossible de mettre à jour ta bio.",
      "Ciudad Donoss": "Ville Donoss",
      "Ciudad solicitada": "Ville demandée",
      "pendiente": "en attente",
      "Barrio": "Quartier",
      "No indicado": "Non indiqué",
      "Elige tu barrio": "Choisis ton quartier",
      "Escribe tu barrio": "Écris ton quartier",
      "Guardar barrio": "Enregistrer le quartier",
      "El barrio debe tener entre 2 y 60 caracteres.": "Le quartier doit contenir entre 2 et 60 caractères.",
      "Barrio actualizado correctamente.": "Quartier mis à jour correctement.",
      "No se ha podido actualizar tu barrio.": "Impossible de mettre à jour ton quartier.",
      "Dirección": "Adresse",
      "Categorías": "Catégories",
      "Información esencial": "Informations essentielles",
      "Si necesitas modificar un dato urgente o esencial que no aparece editable aquí, contacta con Donoss para revisarlo de forma segura.": "Si tu dois modifier une information urgente ou essentielle qui n’est pas modifiable ici, contacte Donoss pour la vérifier en sécurité.",
      "Ejemplos: correo electrónico, teléfono principal, datos fiscales, dirección fiscal o cuenta bancaria/IBAN.": "Exemples : e-mail, téléphone principal, données fiscales, adresse fiscale ou compte bancaire/IBAN.",
      "Ejemplos: correo electrónico, teléfono principal, datos fiscales o datos sensibles de tu cuenta.": "Exemples : e-mail, téléphone principal, données fiscales ou données sensibles de ton compte.",
      "Contacta con Donoss": "Contacter Donoss",
      "Última versión": "Dernière version",
      "Si algo no aparece después de una actualización, recarga Donoss sin cerrar sesión.": "Si quelque chose n’apparaît pas après une mise à jour, recharge Donoss sans te déconnecter.",
      "Plan Premium": "Plan Premium",
      "Certificación Donoss": "Certification Donoss",
      "Gana confianza y muestra tus ofertas oficiales con más autoridad dentro de Donoss.": "Gagne en confiance et affiche tes offres officielles avec plus d’autorité dans Donoss.",
      "Demuestra que eres una persona real y consigue una atención más rápida cuando necesites ayuda.": "Montre que tu es une vraie personne et bénéficie d’une aide plus rapide quand tu en as besoin.",
      "cada 31 días": "tous les 31 jours",
      "Premium activado correctamente. Tu certificación ya está activa.": "Premium activé correctement. Ta certification est active.",
      "No tienes puntos suficientes para activar Premium.": "Tu n’as pas assez de points pour activer Premium.",
      "Completa tu NIE/DNI y una foto visible antes de activar Premium.": "Complète ton NIE/DNI et une photo visible avant d’activer Premium.",
      "No se ha podido activar Premium.": "Impossible d’activer Premium.",
      "Estado": "Statut",
      "Pago al día": "Paiement à jour",
      "Pago fallido": "Paiement échoué",
      "Sin activar": "Non activé",
      "Próximo cobro": "Prochain prélèvement",
      "Al activar Premium": "À l’activation de Premium",
      "No programado": "Non programmé",
      "Certificación": "Certification",
      "Activa": "Active",
      "No activa": "Non active",
      "Identidad": "Identité",
      "Completa": "Complète",
      "Pendiente": "En attente",
      "Ver detalles Premium": "Voir les détails Premium",
      "Activar Premium": "Activer Premium",
      "Fotos para planes": "Photos pour les plans",
      "Planes con más gente": "Plans avec d’autres personnes",
      "Estas fotos solo se muestran a personas autorizadas en Quedar: quien creó el plan y participantes del mismo grupo. Para apuntarte se necesitan mínimo 2 fotos.": "Ces photos ne sont montrées qu’aux personnes autorisées dans Plans : la personne qui a créé le plan et les participants du même groupe. Il faut au moins 2 photos pour participer.",
      "Una foto es demasiado grande. Usa imágenes de menos de 8 MB.": "Une photo est trop grande. Utilise des images de moins de 8 Mo.",
      "La foto es demasiado grande. Usa una imagen de menos de 8 MB.": "La photo est trop grande. Utilise une image de moins de 8 Mo.",
      "No se ha podido preparar la foto.": "Impossible de préparer la photo.",
      "No se han podido preparar las fotos.": "Impossible de préparer les photos.",
      "Fotos para planes guardadas correctamente.": "Photos pour les plans enregistrées correctement.",
      "No se han podido guardar las fotos.": "Impossible d’enregistrer les photos.",
      "¿Cómo te calificas para Quedar?": "Comment te définir pour les plans ?",
      "Esto se usará automáticamente cuando pulses “Voy contigo”. Puedes cambiarlo cuando quieras.": "Ce choix sera utilisé automatiquement quand tu appuies sur “Je viens avec toi”. Tu peux le modifier quand tu veux.",
      "Preferencia para Quedar guardada correctamente.": "Préférence pour les plans enregistrée correctement.",
      "No se ha podido guardar tu preferencia.": "Impossible d’enregistrer ta préférence.",
      "Chica": "Fille",
      "Chico": "Garçon",
      "Añadir": "Ajouter",
      "Guardar fotos": "Enregistrer les photos",
      "Sesión": "Session",
      "Sal de esta cuenta para entrar con otra.": "Déconnecte-toi de ce compte pour en utiliser un autre.",
      "Cerrar sesión": "Se déconnecter",
      "Política de privacidad": "Politique de confidentialité",
      "Eliminar cuenta y datos": "Supprimer compte et données",
      "Plan para empresas": "Plan pour entreprises",
      "Plan para usuarios": "Plan pour utilisateurs",
      "Verificación de identidad": "Vérification d’identité",
      "Añade tu NIE o DNI para activar Premium.": "Ajoute ton NIE ou DNI pour activer Premium.",
      "Añade una foto visible de ti para activar Premium.": "Ajoute une photo visible de toi pour activer Premium.",
      "Identidad Premium guardada correctamente.": "Identité Premium enregistrée correctement.",
      "No se ha podido guardar la identidad Premium.": "Impossible d’enregistrer l’identité Premium.",
      "Lista": "Prête",
      "NIE o DNI": "NIE ou DNI",
      "Foto visible": "Photo visible",
      "Para modificarlo, contacta con Donoss.": "Pour le modifier, contacte Donoss.",
      "Certificación para ganar confianza.": "Certification pour gagner en confiance.",
      "Tus ofertas oficiales se muestran con más autoridad.": "Tes offres officielles s’affichent avec plus d’autorité.",
      "Certificación para demostrar que eres una persona real.": "Certification pour montrer que tu es une vraie personne.",
      "Servicio de ayuda más rápido cuando lo necesites.": "Aide plus rapide quand tu en as besoin.",
      "Renovar ahora": "Renouveler maintenant",
      "Activar": "Activer",
      "Guardar y activar": "Enregistrer et activer",
      "Planes": "Plans",
      "Crear plan": "Créer un plan",
      "Editar plan": "Modifier le plan",
      "Crear un plan libre": "Créer un plan libre",
      "Crear plan libre": "Créer un plan libre",
      "Publicar un billete": "Publier un billet",
      "Publicar plan libre": "Publier le plan libre",
      "Publicar plan": "Publier le plan",
      "Conectar con jóvenes": "Entrer en contact avec des jeunes",
      "Quedar sin comprar billete": "Créer un plan sans acheter de billet",
      "Guardar y participar": "Enregistrer et participer",
      "Voy contigo": "Je viens avec toi",
      "Editar plan": "Modifier le plan",
      "Pago seguro": "Paiement sécurisé",
      "Pago externo": "Paiement externe",
      "Resumen": "Résumé",
      "Producto": "Produit",
      "Entrega": "Remise",
      "Saldo restante": "Solde restant",
      "Continuar al pago externo": "Continuer vers le paiement externe",
      "Comprar ahora": "Acheter maintenant",
      "Pago realizado": "Paiement réalisé",
      "Compra completada": "Achat terminé",
      "Enlace externo preparado": "Lien externe prêt",
      "Volver a Inicio": "Retour à l’accueil",
      "Transferencias": "Transferts",
      "Pago seguro. Puntos al instante. Sin suscripción.": "Paiement sécurisé. Points instantanés. Sans abonnement.",
      "Pago recibido. Sincronizando tus puntos...": "Paiement reçu. Synchronisation de tes points...",
      "Pago recibido. Si el saldo tarda, vuelve a abrir esta página en unos segundos.": "Paiement reçu. Si le solde tarde, rouvre cette page dans quelques secondes.",
      "Editar oferta": "Modifier l’offre",
      "Guardar oferta": "Enregistrer l’offre",
      "Oferta guardada correctamente.": "Offre enregistrée correctement.",
      "Oferta actualizada correctamente.": "Offre mise à jour correctement.",
      "Oferta ocultada correctamente.": "Offre masquée correctement.",
      "Oferta eliminada definitivamente.": "Offre supprimée définitivement.",
      "Pagar con enlace externo": "Payer avec un lien externe",
      "Comprar, reservar, apuntarme...": "Acheter, réserver, participer...",
      "Crear oferta": "Créer une offre",
      "Elige cómo publicar": "Choisis comment publier",
      "Crear una oferta para Donoss": "Créer une offre pour Donoss",
      "Formulario original": "Formulaire original",
      "Crear manualmente": "Créer manuellement",
      "Automatización": "Automatisation",
      "Copiar desde un enlace": "Copier depuis un lien",
      "Nuevo": "Nouveau",
    },
  };

  function text(value) {
    const source = String(value ?? "");
    const locale = getLocale();
    if (locale !== "fr") return source;
    const trimmed = source.trim();
    const translated = phraseCopy.fr[trimmed];
    if (!translated) {
      const partialPhrases = {
        "España": "Espagne",
        "pendiente": "en attente",
      };
      let next = source;
      Object.entries(partialPhrases).forEach(([from, to]) => {
        next = next.split(from).join(to);
      });
      return next;
    }
    return source.replace(trimmed, translated);
  }

  function applyStaticText(root = document) {
    if (getLocale() !== "fr") return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const translated = text(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    });
    root.querySelectorAll?.("[placeholder], [aria-label], [title]").forEach((node) => {
      ["placeholder", "aria-label", "title"].forEach((attribute) => {
        const value = node.getAttribute(attribute);
        if (!value) return;
        const translated = text(value);
        if (translated !== value) node.setAttribute(attribute, translated);
      });
    });
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

  function applyAll(root = document) {
    applyStaticNav(root);
    applyStaticText(root);
    document.documentElement.lang = getLocale() === "fr" ? "fr" : "es";
  }

  window.donossI18n = { t, text, category, getLocale, setCountry, localeFromCountry, applyStaticNav, applyStaticText, applyAll };
  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target?.parentElement) {
          const translated = text(mutation.target.nodeValue);
          if (translated !== mutation.target.nodeValue) mutation.target.nodeValue = translated;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) applyAll(node);
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            const translated = text(node.nodeValue);
            if (translated !== node.nodeValue) node.nodeValue = translated;
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
