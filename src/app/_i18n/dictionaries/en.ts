export const en = {
  metadata: {
    title: "Remote IT Jobs Radar",
    description:
      "Paste your profile and see remote IT jobs ranked by how well they fit you.",
  },
  home: {
    heading: "Remote IT Jobs Radar",
    tagline:
      "Paste your profile and see remote IT jobs ranked by how well they fit you.",
  },
  languageSwitcher: {
    label: "Language",
  },
  owner: {
    title: "Owner access",
    heading: "Owner access",
    description:
      "Sign in with the owner secret to use the full daily limit of AI searches.",
    secretLabel: "Owner secret",
    submit: "Sign in",
    submitting: "Signing in…",
    signedIn:
      "You are signed in as the owner. Your searches use the full daily limit.",
    signOut: "Sign out",
    errors: {
      invalid: "That secret is not right.",
      disabled: "Owner access is not set up on this server.",
    },
  },
  search: {
    profileLabel: "Your profile",
    profileHint:
      "Paste your CV or describe your experience, skills and the roles you want.",
    privacyNotice:
      "Your text is sent to Google Gemini (free tier), which may use it to improve its products. Before sending it, emails, phone numbers and links are removed. Do not paste sensitive data.",
    countryLabel: "Country you live in",
    countryHint: "Only offers that accept people from this country are shown.",
    submit: "Find offers",
    submitting: "Searching… it can take up to a minute",
    summary: "{count} offers fit your skills.",
    errors: {
      empty: "Paste your profile first.",
      too_long: "The text is too long. Shorten it to {max} characters.",
      no_skills:
        "No technical skills were found in the text. Add the technologies you use.",
      quota_exhausted:
        "The daily limit of AI searches is used up. Try again tomorrow.",
      unavailable:
        "Gemini is not answering right now. Try again in a few minutes.",
      invalid_country: "Choose a country from the list.",
      disabled: "AI search is not set up on this server.",
      unexpected: "Something went wrong. Try again in a few minutes.",
    },
  },
};

export type Dictionary = typeof en;
