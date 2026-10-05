import { Users } from "lucide-react";
import { IndicesBadge } from "@/components/IndicesBadge";
import { ProfileDropdownRow } from "@/components/ProfileDropdown";

/**
 * One person under "Other Home Address Residents" or "Registered Associates".
 * Closed it's a single row; tapped it opens in place and shows the same details
 * as that person's own profile page. Any number of rows can stay open at once.
 */
export function RegistryPersonRow({
  name,
  isIndicesOnly,
  kind,
}: {
  name: string;
  isIndicesOnly: boolean;
  kind: "resident" | "associate";
}) {
  return (
    <ProfileDropdownRow kind="associate" refId={name}>
      <Users
        className={`w-3.5 h-3.5 shrink-0 ${
          kind === "resident" ? "text-rose-500" : "text-emerald-500"
        }`}
      />
      <span className="text-xs font-medium text-foreground flex-1 min-w-0 break-words">
        {name}
      </span>
      {isIndicesOnly && <IndicesBadge />}
    </ProfileDropdownRow>
  );
}
