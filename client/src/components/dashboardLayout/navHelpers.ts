// Part of the side menu (client/src/components/DashboardLayout.tsx): small helpers the nav pieces share.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

// Expanding Op Manager / CTO Roster reveals sub-items below the clicked
// button without generating a scroll event, so on a short sidebar viewport
// the new items can land almost entirely below the fold. Scrolling to bring
// the whole newly-revealed block into view doesn't help when that block is
// taller than the viewport — it just aligns to its top and still hides most
// of it. Instead, scroll the clicked button itself up near the top of the
// container, which maximizes the space left below it for the reveal.
export function scrollToggleNearTop(
  container: HTMLElement | null,
  btn: HTMLElement | null,
  behavior: ScrollBehavior = "smooth"
) {
  if (!container || !btn) return;
  const containerRect = container.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const offsetWithinContainer =
    btnRect.top - containerRect.top + container.scrollTop;
  container.scrollTo({
    top: Math.max(0, offsetWithinContainer - 12),
    behavior,
  });
}

// Pages that live under the Administration folder (same list drives the
// folder's highlight in list view and tile view).
export function isAdministrationPath(location: string): boolean {
  return (
    location === "/audit" ||
    location === "/draft" ||
    location === "/operation-management" ||
    location === "/recycle-bin" ||
    location.startsWith("/administration/intel-export") ||
    location.startsWith("/shortcuts") ||
    location === "/help"
  );
}
