export function assertDirectConnection(connectionString: string): void {
  let hostname: string;
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    throw new Error("DATABASE_URL_UNPOOLED is not a valid URL.");
  }

  if (hostname.includes("-pooler")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED points to a pooled connection. Migrations need the direct one: session locks do not work through the pooler.",
    );
  }
}
