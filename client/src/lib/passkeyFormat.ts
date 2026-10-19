/** A date and time in Perth time, as RunLog shows everywhere. */
export function formatPerth(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Perth",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}
