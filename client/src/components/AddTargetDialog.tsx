/**
 * Add Target dialog — full structured Name → Address → Vehicle entry for a
 * brand-new target, shared between the Target Registry page and Operation
 * Detail's "Add Target" flow so a target can't be created anywhere in the
 * app via a bare free-text name field. Includes the same possible-duplicate
 * detection/merge flow either caller wants: `onSave` receives the composed
 * payload for the caller to `create.mutateAsync`, while the duplicate check
 * and field-level merge (against an existing target) are handled internally.
 */

import { useAddTargetScreen } from "./addTarget/useAddTargetScreen";
import { AddTargetView } from "./addTarget/AddTargetView";
import type { AddTargetDialogProps } from "./addTarget/types";

export type { RegistryCreatePayload, StagedAssociate } from "./addTarget/types";
export { computePrimaryIdentity, readImageFile } from "./addTarget/helpers";

export function AddTargetDialog(props: AddTargetDialogProps) {
  const s = useAddTargetScreen(props);
  return <AddTargetView s={s} />;
}
