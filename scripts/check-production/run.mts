import { parseBaseUrl, runChecks } from "./checks.mts";

async function main(): Promise<void> {
  const base = parseBaseUrl(process.argv[2]);
  console.log(`Checking ${base.origin}`);
  const results = await runChecks(base, fetch);
  for (const result of results) {
    console.log(
      `${result.ok ? "PASS" : "FAIL"}  ${result.name} (${result.detail})`,
    );
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(
    failed === 0 ? "Everything passed." : `${failed} check(s) failed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
