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
      "Your text is sent to Google Gemini to be analyzed. Google keeps it for a limited time to detect abuse and does not use it to improve its products. Before sending it, emails, phone numbers and links are removed. Do not paste sensitive data.",
    countryLabel: "Country you live in",
    countryHint: "Only offers that accept people from this country are shown.",
    submit: "Find offers",
    submitting: "Searching… it can take up to a minute",
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
      rate_limited:
        "You reached today's limit of searches from this connection. Try again tomorrow.",
    },
  },
  results: {
    heading: "Results",
    profileSkills: "Skills found in your profile: {skills}.",
    summary:
      "{matching} of the {eligible} active offers for your country mention your skills.",
    none: "None of the active offers for your country mention your skills. Add more technologies to your profile and try again.",
    scoredHeading: "Ranked by fit",
    unscoredHeading: "Not scored",
    unscoredNotice: {
      quota:
        "The daily limit of AI searches ran out before these offers could be scored. They mention your skills, so they are listed by how many of them they mention.",
      error:
        "Gemini stopped answering before these offers could be scored. They mention your skills, so they are listed by how many of them they mention.",
      partial:
        "Gemini could not score these offers. They mention your skills, so they are listed by how many of them they mention.",
    },
    score: "{score}/100",
    bands: {
      excellent: "Very good fit",
      good: "Good fit",
      partial: "Partial fit",
      low: "Poor fit",
    },
    matchedSkills: "Matching skills: {skills}",
    posted: "Posted on {date}",
    noDate: "Date not stated",
    noCompany: "Company not stated",
    source: "Source:",
    newBadge: "New",
    newSinceOne: "1 new offer since your last search, on {date}.",
    newSinceMany: "{count} new offers since your last search, on {date}.",
    noneNewSince: "No new offers since your last search, on {date}.",
    firstSearch:
      "From your next search in this browser on, new offers will be marked.",
  },
  status: {
    notFoundHeading: "Page not found",
    notFoundText: "The address does not match any page of the radar.",
    errorHeading: "Something went wrong",
    errorText:
      "The page could not be loaded. Try again, and if it keeps failing, come back in a few minutes.",
    retry: "Try again",
    backHome: "Go to the search",
  },
};

export type Dictionary = typeof en;
