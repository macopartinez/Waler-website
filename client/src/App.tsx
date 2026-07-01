import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Landing from "@/pages/Landing";

// Landing stays eager (it's the entry / measured page). Every other route is
// code-split so heavy deps (recharts, Dashboard, billing…) stay off the
// landing critical path and load only when their route is visited.
const Storytelling = lazy(() => import("@/pages/Storytelling"));
const Onboard = lazy(() => import("@/pages/Onboard"));
const Verification = lazy(() => import("@/pages/Verification"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const HowItWorks = lazy(() => import("@/pages/HowItWorks"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const LegalNotice = lazy(() => import("@/pages/LegalNotice"));
const Cookies = lazy(() => import("@/pages/Cookies"));
const PlanComparison = lazy(() => import("@/pages/PlanComparison"));
const UpgradeToPro = lazy(() => import("@/pages/UpgradeToPro"));
const Billing = lazy(() => import("@/pages/Billing"));
const ClassificationDashboard = lazy(() =>
  import("@/components/classification/ClassificationDashboard").then((m) => ({
    default: m.ClassificationDashboard,
  })),
);
const ExtensionAuth = lazy(() => import("@/pages/ExtensionAuth"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/story" component={Storytelling} />
        <Route path="/onboard" component={Onboard} />
        <Route path="/verification" component={Verification} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/plan-comparison" component={PlanComparison} />
        <Route path="/upgrade-to-pro" component={UpgradeToPro} />
        <Route path="/billing" component={Billing} />
        <Route path="/how-it-works" component={HowItWorks} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/legal" component={LegalNotice} />
        <Route path="/cookies" component={Cookies} />
        <Route path="/dashboard/:userId" component={Dashboard} />
        <Route path="/classification" component={ClassificationDashboard} />
        <Route path="/extension-auth" component={ExtensionAuth} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </SubscriptionProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
