const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificDay(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    throw new RangeError("Invalid date");
  }
  const parts = new Map(
    FORMATTER.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}
