import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
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
import DepartmentsManagement from "./pages/DepartmentsManagement";
import Vacations from "./pages/Vacations";
import Profile from "./pages/Profile";
import Incidents from "./pages/Incidents";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound";
import NotificationsPage from "./pages/Notifications";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NotificationsProvider>
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
                <ProtectedRoute excludedRoles={["global_manager", "superadmin"]}>
                  <Attendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute excludedRoles={["global_manager", "superadmin"]}>
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
                <ProtectedRoute allowedRoles={["department_head"]}>
                  <Department />
                </ProtectedRoute>
              }
            />
            <Route
              path="/global"
              element={
                <ProtectedRoute allowedRoles={["global_manager", "superadmin"]}>
                  <GlobalPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuration"
              element={
                <ProtectedRoute allowedRoles={["global_manager", "superadmin"]}>
                  <Configuration />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacations"
              element={
                <ProtectedRoute excludedRoles={["global_manager", "superadmin"]}>
                  <Vacations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={["global_manager", "superadmin"]}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/departments-admin"
              element={
                <ProtectedRoute allowedRoles={["global_manager", "superadmin"]}>
                  <DepartmentsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin"
              element={
                <ProtectedRoute allowedRoles={["superadmin"]}>
                  <SuperAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/incidents"
              element={
                <ProtectedRoute>
                  <Incidents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </NotificationsProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
