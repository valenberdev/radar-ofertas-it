export interface Check {
  readonly name: string;
  readonly path: string;
  readonly status: number;
  readonly includes: readonly string[];
}

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export const CHECKS: readonly Check[] = [
  {
    name: "Health check reaches the database",
    path: "/api/health",
    status: 200,
    includes: ['"status":"ok"'],
  },
  {
    name: "Spanish home shows the search form",
    path: "/es",
    status: 200,
    includes: ['lang="es"', 'id="search-profile"'],
  },
  {
    name: "English home shows the search form",
    path: "/en",
    status: 200,
    includes: ['lang="en"', 'id="search-profile"'],
  },
  {
    name: "Unknown page answers 404",
    path: "/es/this-page-does-not-exist",
    status: 404,
    includes: [],
  },
  {
    name: "Owner page is kept out of search engines",
    path: "/es/owner",
    status: 200,
    includes: ["noindex"],
  },
  {
    name: "Purge cron refuses requests without the secret",
    path: "/api/cron/purge",
    status: 401,
    includes: [],
  },
  {
    name: "Ingest cron refuses requests without the secret",
    path: "/api/cron/ingest/himalayas",
    status: 401,
    includes: [],
  },
];

export function parseBaseUrl(raw: string | undefined): URL {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      "Pass the address of the deployment, for example https://radar-ofertas-it.vercel.app",
    );
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`Not a valid address: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`The address must start with https:// or http://: ${raw}`);
  }
  return new URL(url.origin);
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : "Unknown error";
}

export async function runCheck(
  base: URL,
  check: Check,
  fetchFn: typeof fetch,
): Promise<CheckResult> {
  try {
    const response = await fetchFn(new URL(check.path, base), {
      redirect: "manual",
    });
    const body = await response.text();
    if (response.status !== check.status) {
      return {
        name: check.name,
        ok: false,
        detail: `expected status ${check.status}, got ${response.status}`,
      };
    }
    const missing = check.includes.filter((text) => !body.includes(text));
    if (missing.length > 0) {
      return {
        name: check.name,
        ok: false,
        detail: `the page does not contain ${missing.map((text) => JSON.stringify(text)).join(", ")}`,
      };
    }
    return { name: check.name, ok: true, detail: `status ${response.status}` };
  } catch (error) {
    return {
      name: check.name,
      ok: false,
      detail: `request failed: ${describeError(error)}`,
    };
  }
}

export async function runChecks(
  base: URL,
  fetchFn: typeof fetch,
  checks: readonly Check[] = CHECKS,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(base, check, fetchFn));
  }
  return results;
}
