import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
import type { SheetScreen } from "./useSheetScreen";

/** the Add Target dialog opened from Sheet Details. */
export function NewTargetDialog({ s }: { s: SheetScreen }) {
  const {
    sheet,
    setEditSelectedTargetId,
    setEditTargetMode,
    setEditCreateTargetDialogOpen,
    editCreateTargetDialogOpen,
    sheetOperation,
    createLinkedTargetForEditSheet,
    createTargetForEditSheet,
  } = s;
  return (
    <>
      {/* New Target — same structured Add Target dialog used everywhere else */}
      <AddTargetDialog
        open={editCreateTargetDialogOpen}
        onClose={() => setEditCreateTargetDialogOpen(false)}
        initialOperation={
          sheet
            ? { id: sheet.operationId, name: sheetOperation?.name ?? "" }
            : undefined
        }
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          const result = existingAssociateId
            ? await createLinkedTargetForEditSheet.mutateAsync({
                ...rest,
                existingAssociateId,
              })
            : await createTargetForEditSheet.mutateAsync(rest);
          setEditSelectedTargetId(result.id);
          setEditTargetMode("link");
          return result;
        }}
      />
    </>
  );
}
