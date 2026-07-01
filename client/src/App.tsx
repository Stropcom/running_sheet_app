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
import MyProfilePage from "./pages/MyProfilePage";
import TodoPage from "./pages/TodoPage";
import ShortcutsPage from "./pages/ShortcutsPage";
import IntelligencePage from "./pages/Intelligence";
import GovernancePage from "./pages/Governance";
import GovernanceListPage from "./pages/GovernanceList";
import TargetRegistryPage from "./pages/TargetRegistry";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/profile" component={MyProfilePage} />
      <Route path="/" component={Home} />
      <Route path="/operation/:id" component={OperationDetail} />
      <Route path="/sheet/:id" component={SheetDetail} />
      <Route path="/todo" component={TodoPage} />
      <Route path="/shortcuts" component={ShortcutsPage} />
      <Route path="/intelligence" component={IntelligencePage} />
      <Route path="/governance" component={GovernanceListPage} />
      <Route path="/governance/:sheetId" component={GovernancePage} />
      <Route path="/target-registry" component={TargetRegistryPage} />
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
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
