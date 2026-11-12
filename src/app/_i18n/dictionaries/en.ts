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
};

export type Dictionary = typeof en;
