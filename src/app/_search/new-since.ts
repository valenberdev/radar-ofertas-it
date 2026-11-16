export const LAST_SEARCH_KEY = "radar:last-search-at";

export interface SearchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export function readLastSearch(storage: SearchStorage | null): string | null {
  try {
    const value = storage?.getItem(LAST_SEARCH_KEY) ?? null;
    return value !== null && isValidDate(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSearch(storage: SearchStorage | null, at: Date): void {
  try {
    storage?.setItem(LAST_SEARCH_KEY, at.toISOString());
  } catch {
    return;
  }
}

export function isNewSince(
  firstSeenAt: string,
  previousSearchAt: string | null,
): boolean {
  return (
    previousSearchAt !== null &&
    new Date(firstSeenAt).getTime() > new Date(previousSearchAt).getTime()
  );
}
