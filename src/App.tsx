import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import OnboardingSubscribe from "./pages/OnboardingSubscribe";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import CreateContent from "./pages/CreateContent";
import ContentDetail from "./pages/ContentDetail";
import Instructions from "./pages/Instructions";
import Schedule from "./pages/Schedule";
import Settings from "./pages/Settings";
import Ideas from "./pages/Ideas";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* AuthGuard handles state-based routing for every authenticated route */}
          <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
          <Route path="/onboarding/subscribe" element={<AuthGuard><OnboardingSubscribe /></AuthGuard>} />
          <Route path="/subscription/success" element={<AuthGuard><SubscriptionSuccess /></AuthGuard>} />

          {/* Root → AuthGuard routes user to their correct destination */}
          <Route path="/" element={<AuthGuard><Navigate to="/schedule" replace /></AuthGuard>} />
          <Route path="/content" element={<Navigate to="/schedule" replace />} />
          <Route path="/content/new" element={<AuthGuard><CreateContent /></AuthGuard>} />
          <Route path="/content/:id" element={<AuthGuard><ContentDetail /></AuthGuard>} />
          <Route path="/schedule" element={<AuthGuard><Schedule /></AuthGuard>} />
          <Route path="/ideas" element={<AuthGuard><Ideas /></AuthGuard>} />
          <Route path="/instructions" element={<AuthGuard><Instructions /></AuthGuard>} />
          {/* Settings allowed without subscription so users can manage/restart their plan */}
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />

          {/* Redirect old routes */}
          <Route path="/connections" element={<Navigate to="/settings?tab=connections" replace />} />
          <Route path="/jobs" element={<Navigate to="/schedule" replace />} />
          <Route path="/jobs/new" element={<Navigate to="/content/new" replace />} />
          <Route path="/jobs/:id" element={<Navigate to="/schedule" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
