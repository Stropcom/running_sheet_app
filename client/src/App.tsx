import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import OperationDetail from "./pages/OperationDetail";
import SheetDetail from "./pages/SheetDetail";
import AuditLogPage from "./pages/AuditLogPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import MyProfilePage from "./pages/MyProfilePage";
import TodoPage from "./pages/TodoPage";
import TodoGovernancePage from "./pages/TodoGovernancePage";
import ShortcutsPage from "./pages/ShortcutsPage";
import IntelligencePage from "./pages/Intelligence";
import AssociationMap from "./pages/AssociationMap";
import GovernancePage from "./pages/Governance";
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
import TileHomeScreen from "@/pages/TileHomeScreen";
import ImagesPage from "@/pages/ImagesPage";
import OperationManagerPage from "@/pages/OperationManagerPage";
import { DraftModeBanner } from "@/components/DraftModeBanner";
import { SectionColorProvider } from "@/contexts/SectionColorContext";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

/** Reads the logged-in user's wallpaper settings from auth.me and applies
 * the CSS variables globally so the background persists across all pages. */
function WallpaperApplier() {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!user) return;
    const u = user as { wallpaperUrl?: string | null; wallpaperOpacity?: number | null };
    if (u.wallpaperUrl) {
      document.documentElement.style.setProperty("--wallpaper-url", `url(${u.wallpaperUrl})`);
      const opacity = u.wallpaperOpacity ?? 40;
      document.documentElement.style.setProperty("--wallpaper-opacity", String((100 - opacity) / 100));
    } else {
      document.documentElement.style.removeProperty("--wallpaper-url");
      document.documentElement.style.removeProperty("--wallpaper-opacity");
    }
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
      <Route path="/todo/governance" component={TodoGovernancePage} />
      <Route path="/shortcuts" component={ShortcutsPage} />
      <Route path="/intelligence" component={IntelligencePage} />
      <Route path="/intelligence/entities" component={IntelligencePage} />
      <Route path="/intelligence/association-map" component={AssociationMap} />
      <Route path="/intelligence/target/:id" component={IntelligenceTargetProfile} />
      <Route path="/intelligence/operation/:id" component={IntelligenceOperationProfile} />
      <Route path="/intelligence/associate/:label" component={IntelligenceAssociateProfile} />
      <Route path="/intelligence/vehicle/:label" component={IntelligenceVehicleProfile} />
      <Route path="/intelligence/location/:label" component={IntelligenceLocationProfile} />
      <Route path="/intelligence/mapping" component={IntelligenceMapping} />
      <Route path="/intelligence/rs-mapping" component={RSMapping} />
      <Route path="/governance" component={GovernanceListPage} />
      <Route path="/governance/:sheetId" component={GovernancePage} />
      <Route path="/target-registry" component={TargetRegistryPage} />
      <Route path="/images" component={ImagesPage} />
      <Route path="/images/:operationId" component={ImagesPage} />
      <Route path="/operation-manager" component={OperationManagerPage} />
      <Route path="/operation-management" component={OperationManagementPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/court/statements" component={StatementsPage} />
      <Route path="/court/witness-list" component={WitnessListPage} />
      <Route path="/court/wipc" component={WIPCPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/recycle-bin" component={RecycleBin} />
      <Route path="/draft" component={DraftHubPage} />
      <Route path="/draft/sheet/:localId" component={DraftSheetPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/tile-home" component={TileHomeScreen} />
      <Route path="/audit" component={AuditLogPage} />
      <Route path="/admin" component={AdminPage} />
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
            {/* Apply wallpaper CSS variables globally on every page */}
            <WallpaperApplier />
            <Toaster />
            <DraftModeBanner />
            <Router />
          </SectionColorProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
