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
    summary: "{count} ofertas encajan con tus habilidades.",
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
    },
  },
};
