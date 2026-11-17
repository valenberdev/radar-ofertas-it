import type { Dictionary } from "./en";

export const es: Dictionary = {
  metadata: {
    title: "Radar de ofertas IT remotas",
    description:
      "Pega tu perfil y mira ofertas IT remotas ordenadas según qué tan bien encajan contigo.",
  },
  home: {
    heading: "Radar de ofertas IT remotas",
    tagline:
      "Pega tu perfil y mira ofertas IT remotas ordenadas según qué tan bien encajan contigo.",
  },
  languageSwitcher: {
    label: "Idioma",
  },
  owner: {
    title: "Acceso del dueño",
    heading: "Acceso del dueño",
    description:
      "Ingresa con el secreto del dueño para usar el límite diario completo de búsquedas con IA.",
    secretLabel: "Secreto del dueño",
    submit: "Ingresar",
    submitting: "Ingresando…",
    signedIn:
      "Ingresaste como dueño. Tus búsquedas usan el límite diario completo.",
    signOut: "Cerrar sesión",
    errors: {
      invalid: "Ese secreto no es correcto.",
      disabled: "El acceso del dueño no está configurado en este servidor.",
    },
  },
  search: {
    profileLabel: "Tu perfil",
    profileHint:
      "Pega tu CV o describe tu experiencia, tus habilidades y los puestos que buscas.",
    privacyNotice:
      "Tu texto se envía a Google Gemini (nivel gratuito), que puede usarlo para mejorar sus productos. Antes de enviarlo se borran emails, teléfonos y enlaces. No pegues datos sensibles.",
    countryLabel: "País donde vives",
    countryHint: "Solo se muestran ofertas que aceptan personas de este país.",
    submit: "Buscar ofertas",
    submitting: "Buscando… puede tardar hasta un minuto",
    errors: {
      empty: "Primero pega tu perfil.",
      too_long: "El texto es demasiado largo. Acórtalo a {max} caracteres.",
      no_skills:
        "No se encontraron habilidades técnicas en el texto. Agrega las tecnologías que usas.",
      quota_exhausted:
        "Se agotó el límite diario de búsquedas con IA. Vuelve a intentarlo mañana.",
      unavailable:
        "Gemini no está respondiendo ahora. Vuelve a intentarlo en unos minutos.",
      invalid_country: "Elige un país de la lista.",
      disabled: "La búsqueda con IA no está configurada en este servidor.",
      unexpected: "Algo salió mal. Vuelve a intentarlo en unos minutos.",
      rate_limited:
        "Llegaste al límite de búsquedas de hoy desde esta conexión. Vuelve a intentarlo mañana.",
    },
  },
  results: {
    heading: "Resultados",
    profileSkills: "Habilidades encontradas en tu perfil: {skills}.",
    summary:
      "{matching} de las {eligible} ofertas activas para tu país mencionan tus habilidades.",
    none: "Ninguna de las ofertas activas para tu país menciona tus habilidades. Agrega más tecnologías a tu perfil y vuelve a intentarlo.",
    scoredHeading: "Ordenadas por encaje",
    unscoredHeading: "Sin puntaje",
    unscoredNotice: {
      quota:
        "Se agotó el límite diario de búsquedas con IA antes de puntuar estas ofertas. Mencionan tus habilidades, así que se ordenan por cuántas mencionan.",
      error:
        "Gemini dejó de responder antes de puntuar estas ofertas. Mencionan tus habilidades, así que se ordenan por cuántas mencionan.",
      partial:
        "Gemini no pudo puntuar estas ofertas. Mencionan tus habilidades, así que se ordenan por cuántas mencionan.",
    },
    score: "{score}/100",
    bands: {
      excellent: "Encaje muy bueno",
      good: "Buen encaje",
      partial: "Encaje parcial",
      low: "Encaje bajo",
    },
    matchedSkills: "Habilidades que coinciden: {skills}",
    posted: "Publicada el {date}",
    noDate: "Sin fecha",
    noCompany: "Empresa no indicada",
    source: "Fuente:",
    newBadge: "Nueva",
    newSinceOne: "1 oferta nueva desde tu última búsqueda, el {date}.",
    newSinceMany: "{count} ofertas nuevas desde tu última búsqueda, el {date}.",
    noneNewSince: "Ninguna oferta nueva desde tu última búsqueda, el {date}.",
    firstSearch:
      "Desde tu próxima búsqueda en este navegador se van a marcar las ofertas nuevas.",
  },
  status: {
    notFoundHeading: "Página no encontrada",
    notFoundText: "La dirección no corresponde a ninguna página del radar.",
    errorHeading: "Algo salió mal",
    errorText:
      "La página no se pudo cargar. Vuelve a intentarlo y, si sigue fallando, regresa en unos minutos.",
    retry: "Reintentar",
    backHome: "Ir a la búsqueda",
  },
};
