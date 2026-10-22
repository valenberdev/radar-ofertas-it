import { pool } from "@/infrastructure/db/pool";

export async function GET() {
  try {
    await pool.query("select 1");
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error(
      "Health check failed:",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ status: "error" }, { status: 503 });
  }
}
