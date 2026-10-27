import { useAuth } from "@/_core/hooks/useAuth";
import { broadcastSharing } from "@/lib/nativeLocation";
import { useMustShareLocation } from "@/lib/teams";
import { useSharingFlag } from "@/lib/useSharingFlag";

/** The operation name in the top banner. It is also a Show & Share switch:
 * white while sharing is off, Phosphor green while it is on. The Map page
 * follows the same flag, so this starts and stops the GPS exactly as the
 * switch in its side panel does. A team that must share has it locked on. */
export function BannerOperation({ label }: { label: string }) {
  const { user } = useAuth();
  const mustShare = useMustShareLocation();
  const on = useSharingFlag(user?.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!user || mustShare}
      onClick={() => broadcastSharing(user?.id, !on)}
      title={`Map operation: ${label} — Show & Share is ${on ? "on" : "off"}${
        mustShare ? "" : ". Tap to switch it"
      }`}
      className={`hidden xl:flex items-center justify-center max-w-[220px] px-3 py-2 rounded-xl border border-sidebar-border/60 bg-transparent text-sm font-semibold shadow-sm transition-colors hover:bg-sidebar-accent disabled:cursor-default disabled:hover:bg-transparent ${
        on ? "text-[color:var(--share-on)]" : "text-sidebar-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
