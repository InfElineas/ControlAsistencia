import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Attendance from "./pages/Attendance";
import History from "./pages/History";
import RestSchedule from "./pages/RestSchedule";
import Department from "./pages/Department";
import GlobalPanel from "./pages/GlobalPanel";
import Configuration from "./pages/Configuration";
import UserManagement from "./pages/UserManagement";
import Vacations from "./pages/Vacations";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute excludedRoles={['global_manager']}>
                  <Attendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute excludedRoles={['global_manager']}>
                  <History />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rest-schedule"
              element={
                <ProtectedRoute>
                  <RestSchedule />
                </ProtectedRoute>
              }
            />
            <Route
              path="/department"
              element={
                <ProtectedRoute allowedRoles={['department_head']}>
                  <Department />
                </ProtectedRoute>
              }
            />
            <Route
              path="/global"
              element={
                <ProtectedRoute allowedRoles={['global_manager']}>
                  <GlobalPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuration"
              element={
                <ProtectedRoute allowedRoles={['global_manager']}>
                  <Configuration />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacations"
              element={
                <ProtectedRoute excludedRoles={['global_manager']}>
                  <Vacations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['global_manager']}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
