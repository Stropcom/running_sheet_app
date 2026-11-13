import { useRosterScreen } from "./rosterPage/useRosterScreen";
import { RosterView } from "./rosterPage/RosterView";

// ── Main page ──────────────────────────────────────────────────────────────
export default function RosterPage() {
  const s = useRosterScreen();
  return <RosterView s={s} />;
}
