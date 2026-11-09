// A measurement, amount or ordinal written as one word — "30cm", "5kg", "9pm",
// "2nd" — is made of digits and letters, so it has the same shape as a vehicle
// registration, but it is never one. Used wherever the app decides whether a
// word is a rego (the space-bar "(Vehicle …)" bracket on the sheet, the entity
// extraction, the registration finder) so "approx 30cm x 30cm x 30cm" is not
// read as three vehicles. Pure rule, tested in server/measurementWord.test.ts.

const UNITS =
  "mm|cm|m|km|kg|g|mg|l|ml|ft|in|lb|lbs|oz|mph|kph|kmh|am|pm|st|nd|rd|th|hr|hrs|min|mins|sec|secs|yo|yr|yrs|kb|mb|gb|tb|k|x";

const MEASUREMENT_RE = new RegExp(`^\\d+(?:\\.\\d+)?(?:${UNITS})$`, "i");

/** True for a number followed only by a unit ("30cm", "2.5kg", "10am", "3rd"). */
export function isMeasurementWord(word: string): boolean {
  return MEASUREMENT_RE.test(word.trim());
}
