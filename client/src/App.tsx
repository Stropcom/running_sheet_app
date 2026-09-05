import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_COLOR_PALETTE } from "@shared/const";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { FaceMatchNotificationProvider } from "./contexts/FaceMatchNotificationContext";
import Home from "./pages/Home";
import OperationDetail from "./pages/OperationDetail";
import SheetDetail from "./pages/SheetDetail";
import AuditLogPage from "./pages/AuditLogPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import MyProfilePage from "./pages/MyProfilePage";
import TodoPage from "./pages/TodoPage";
import TodoImagesPage from "./pages/TodoImagesPage";
import TodoGovernancePage from "./pages/TodoGovernancePage";
import ShortcutsPage from "./pages/ShortcutsPage";
import IntelligencePage from "./pages/Intelligence";
import GovernancePage from "./pages/Governance";
import SheetSummaryPage from "./pages/SheetSummary";
import GovernanceListPage from "./pages/GovernanceList";
import TargetRegistryPage from "./pages/TargetRegistry";
import OperationManagementPage from "./pages/OperationManagementPage";
import CalendarPage from "./pages/CalendarPage";
import StatementsPage from "./pages/StatementsPage";
import WitnessListPage from "./pages/WitnessListPage";
import WIPCPage from "./pages/WIPCPage";
import HelpPage from "./pages/HelpPage";
import RecycleBin from "@/pages/RecycleBin";
import DraftHubPage from "@/pages/DraftHubPage";
import IntelligenceTargetProfile from "@/pages/IntelligenceTargetProfile";
import IntelligenceOperationProfile from "@/pages/IntelligenceOperationProfile";
import IntelligenceAssociateProfile from "@/pages/IntelligenceAssociateProfile";
import IntelligenceVehicleProfile from "@/pages/IntelligenceVehicleProfile";
import IntelligenceLocationProfile from "@/pages/IntelligenceLocationProfile";
import IntelligenceMapping from "@/pages/IntelligenceMapping";
import RSMapping from "@/pages/RSMapping";
import DraftSheetPage from "@/pages/DraftSheetPage";
import ReportsPage from "@/pages/ReportsPage";
import WeeklyActivityReportPage from "@/pages/WeeklyActivityReportPage";
import WeeklyTaskingReportPage from "@/pages/WeeklyTaskingReportPage";
import ImagesPage from "@/pages/ImagesPage";
import OperationManagerPage from "@/pages/OperationManagerPage";
import CtoRosterPage from "@/pages/CtoRoster/RosterPage";
import CtoRosterMyShiftsPage from "@/pages/CtoRoster/MyShiftsPage";
import CtoRosterMemberManagementPage from "@/pages/CtoRoster/MemberManagementPage";
import CtoRosterDraftsListPage from "@/pages/CtoRoster/DraftsListPage";
import CtoRosterDraftRosterPage from "@/pages/CtoRoster/DraftRosterPage";
import CtoRosterDraftMergePage from "@/pages/CtoRoster/DraftMergePage";
import CtoRosterSavedRostersListPage from "@/pages/CtoRoster/SavedRostersListPage";
import CtoRosterSavedRosterPage from "@/pages/CtoRoster/SavedRosterPage";
import CtoRosterEACompliancePage from "@/pages/CtoRoster/EACompliancePage";
import CtoRosterOutlookPage from "@/pages/CtoRoster/OutlookPage";
import CtoRosterAuditLogPage from "@/pages/CtoRoster/AuditLogPage";
import SmeacBriefingListPage from "@/pages/SmeacBriefingListPage";
import IntelExportPage from "@/pages/IntelExportPage";
import VehicleCrashPage from "@/pages/VehicleCrashPage";
import SmeacBriefingNewPage from "@/pages/SmeacBriefingNewPage";
import SmeacBriefingDetailPage from "@/pages/SmeacBriefingDetailPage";
import SmeacBriefingEditPage from "@/pages/SmeacBriefingEditPage";
import { DraftModeBanner } from "@/components/DraftModeBanner";
import { SectionColorProvider } from "@/contexts/SectionColorContext";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Resolves a CSS colour string (including `oklch(...)`, which the theme
 * variables use) down to a plain `rgb(...)` value.
 *
 * Needed because <meta name="theme-color"> is read by the browser/OS chrome,
 * not by the CSS engine, and iOS in particular won't parse an oklch() value
 * there — it just ignores it and the strip stays whatever it was. Painting the
 * colour onto a 1x1 canvas and reading the pixel back gets an exact rgb
 * equivalent regardless of the source colour space.
 */
function resolveToRgb(cssColor: string): string | null {
  const value = cssColor.trim();
  if (!value) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Assigning an unparseable colour leaves fillStyle at its previous value, so
  // probe from two different sentinels: if both land on the same result the
  // colour really did parse, otherwise it was rejected and we bail out rather
  // than writing a wrong colour to the tag.
  ctx.fillStyle = "#000000";
  ctx.fillStyle = value;
  const fromBlack = ctx.fillStyle;
  ctx.fillStyle = "#ffffff";
  ctx.fillStyle = value;
  if (ctx.fillStyle !== fromBlack) return null;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
}

/**
 * Keeps <meta name="theme-color"> in step with the live theme.
 *
 * The tag was hard-coded to a single dark slate in index.html, so the strip at
 * the very top of the screen (browser chrome in Safari, the status-bar area in
 * the installed PWA) stayed that colour no matter what the user picked — it
 * never followed light/dark or the accent palette. We read the resolved
 * --background (the same token the app's own top bar uses, so the two read as
 * one continuous surface) and write it to the tag.
 *
 * A MutationObserver on <html> is what drives it: the theme toggle sets a
 * `class`, the palette setting sets `data-palette`, and watching the element
 * itself catches both without this needing to know about either mechanism.
 */
function useThemeColorMeta() {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const background = getComputedStyle(root)
        .getPropertyValue("--background")
        .trim();
      const rgb = resolveToRgb(background);
      if (!rgb) return;
      // There can be several theme-color tags (e.g. media-scoped ones); keep
      // them all in step rather than only the first.
      const tags = document.head.querySelectorAll('meta[name="theme-color"]');
      if (tags.length === 0) {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = rgb;
        document.head.appendChild(meta);
        return;
      }
      tags.forEach(tag => tag.setAttribute("content", rgb));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-palette", "style"],
    });
    return () => observer.disconnect();
  }, []);
}

/** Reads the logged-in user's accent-palette setting from auth.me and
 * applies it globally (a data-palette attribute) so it persists across
 * all pages. */
function AppearanceApplier() {
  useThemeColorMeta();

  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!user) return;
    const u = user as { colorPalette?: string | null };
    document.documentElement.dataset.palette =
      u.colorPalette ?? DEFAULT_COLOR_PALETTE;
  }, [user]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route path="/profile" component={MyProfilePage} />
      <Route path="/" component={Home} />
      <Route path="/operation/:id" component={OperationDetail} />
      <Route path="/sheet/:id" component={SheetDetail} />
      <Route path="/todo" component={TodoPage} />
      <Route path="/todo/images" component={TodoImagesPage} />
      <Route path="/todo/governance" component={TodoGovernancePage} />
      <Route path="/shortcuts" component={ShortcutsPage} />
      <Route path="/intelligence" component={IntelligencePage} />
      <Route path="/intelligence/entities" component={IntelligencePage} />
      <Route
        path="/intelligence/target/:id"
        component={IntelligenceTargetProfile}
      />
      <Route
        path="/intelligence/operation/:id"
        component={IntelligenceOperationProfile}
      />
      <Route
        path="/intelligence/associate/:label"
        component={IntelligenceAssociateProfile}
      />
      <Route
        path="/intelligence/vehicle/:label"
        component={IntelligenceVehicleProfile}
      />
      <Route
        path="/intelligence/location/:label"
        component={IntelligenceLocationProfile}
      />
      <Route path="/intelligence/mapping" component={IntelligenceMapping} />
      <Route path="/intelligence/rs-mapping" component={RSMapping} />
      <Route path="/governance" component={GovernanceListPage} />
      <Route path="/governance/:sheetId" component={GovernancePage} />
      <Route path="/summary/:sheetId" component={SheetSummaryPage} />
      <Route path="/target-registry" component={TargetRegistryPage} />
      <Route path="/images" component={ImagesPage} />
      <Route path="/images/:operationId" component={ImagesPage} />
      <Route path="/images/:operationId/:sheetId" component={ImagesPage} />
      <Route path="/operation-manager" component={OperationManagerPage} />
      <Route path="/cto-roster" component={CtoRosterPage} />
      <Route path="/cto-roster/my-shifts" component={CtoRosterMyShiftsPage} />
      <Route
        path="/cto-roster/members"
        component={CtoRosterMemberManagementPage}
      />
      <Route path="/cto-roster/drafts" component={CtoRosterDraftsListPage} />
      <Route
        path="/cto-roster/draft/:draftId/merge"
        component={CtoRosterDraftMergePage}
      />
      <Route
        path="/cto-roster/draft/:draftId"
        component={CtoRosterDraftRosterPage}
      />
      <Route
        path="/cto-roster/saved-rosters"
        component={CtoRosterSavedRostersListPage}
      />
      <Route
        path="/cto-roster/saved-roster/:id"
        component={CtoRosterSavedRosterPage}
      />
      <Route
        path="/cto-roster/ea-compliance"
        component={CtoRosterEACompliancePage}
      />
      <Route path="/cto-roster/outlook" component={CtoRosterOutlookPage} />
      <Route path="/cto-roster/audit" component={CtoRosterAuditLogPage} />
      <Route path="/operation-management" component={OperationManagementPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/court/statements" component={StatementsPage} />
      <Route path="/court/witness-list" component={WitnessListPage} />
      <Route path="/court/wipc" component={WIPCPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/recycle-bin" component={RecycleBin} />
      <Route path="/draft" component={DraftHubPage} />
      <Route path="/draft/sheet/:localId" component={DraftSheetPage} />
      <Route path="/reports/outstanding-actions" component={ReportsPage} />
      <Route
        path="/reports/weekly-activity"
        component={WeeklyActivityReportPage}
      />
      <Route
        path="/reports/weekly-tasking"
        component={WeeklyTaskingReportPage}
      />
      <Route path="/audit" component={AuditLogPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/administration/smeac" component={SmeacBriefingListPage} />
      <Route
        path="/administration/smeac/new"
        component={SmeacBriefingNewPage}
      />
      <Route
        path="/administration/smeac/:id/edit"
        component={SmeacBriefingEditPage}
      />
      <Route
        path="/administration/smeac/:id"
        component={SmeacBriefingDetailPage}
      />
      <Route path="/administration/intel-export" component={IntelExportPage} />
      <Route
        path="/administration/vehicle-crash"
        component={VehicleCrashPage}
      />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <SectionColorProvider>
            <FaceMatchNotificationProvider>
              {/* Apply accent palette globally on every page */}
              <AppearanceApplier />
              <Toaster />
              <DraftModeBanner />
              <Router />
            </FaceMatchNotificationProvider>
          </SectionColorProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
