import {
  regionOfCountries,
  UNKNOWN_REGION,
  WORLDWIDE,
  type Region,
} from "../../../domain/region";

export const ALL_TIMEZONES_COUNT = 37;

export function regionOfHimalayasJob(
  locationRestrictions: readonly string[] | null | undefined,
  timezoneRestrictions: readonly number[] | null | undefined,
): Region {
  if (locationRestrictions === null || locationRestrictions === undefined) {
    return UNKNOWN_REGION;
  }
  if (locationRestrictions.length > 0) {
    return regionOfCountries(locationRestrictions);
  }
  if (timezoneRestrictions === null || timezoneRestrictions === undefined) {
    return UNKNOWN_REGION;
  }
  const unrestricted =
    timezoneRestrictions.length === 0 ||
    timezoneRestrictions.length >= ALL_TIMEZONES_COUNT;
  return unrestricted ? WORLDWIDE : UNKNOWN_REGION;
}
