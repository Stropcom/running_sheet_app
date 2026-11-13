import { useOpManagerScreen } from "./operationManager/useOpManagerScreen";
import { OpManagerView } from "./operationManager/OpManagerView";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OperationManagerPage() {
  const s = useOpManagerScreen();
  return <OpManagerView s={s} />;
}
