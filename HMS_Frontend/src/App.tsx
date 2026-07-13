import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ModulesProvider } from "@/contexts/ModulesContext";
import { ModuleGate } from "@/components/ui/ModuleGate";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Spinner from "@/components/ui/Spinner";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const PatientsPage = lazy(() => import("@/pages/patients/PatientsPage"));
const AppointmentsPage = lazy(() => import("@/pages/appointments/AppointmentsPage"));
const ClinicalPage = lazy(() => import("@/pages/clinical/ClinicalPage"));
const DentalPage = lazy(() => import("@/pages/dental/DentalPage"));
const EyeClinicPage = lazy(() => import("@/pages/eye/EyeClinicPage"));
const PharmacyPage = lazy(() => import("@/pages/pharmacy/PharmacyPage"));
const LabPage = lazy(() => import("@/pages/lab/LabPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const InsurancePage = lazy(() => import("@/pages/insurance/InsurancePage"));
const InventoryPage = lazy(() => import("@/pages/inventory/InventoryPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const BranchesPage = lazy(() => import("@/pages/branches/BranchesPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const NotFoundPage = lazy(() => import("@/pages/errors/ErrorPages").then(m => ({ default: m.NotFoundPage })));
const UnauthorizedPage = lazy(() => import("@/pages/errors/ErrorPages").then(m => ({ default: m.UnauthorizedPage })));

export default function App() {
  return (
    <AuthProvider>
      <ModulesProvider>
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                {/* Default redirect */}
                <Route index element={<Navigate to="/dashboard" replace />} />

                {/* Dashboard */}
                <Route path="dashboard" element={<DashboardPage />} />

                {/* Patient management */}
                <Route path="patients" element={<PatientsPage />} />

                {/* Appointments */}
                <Route path="appointments" element={<AppointmentsPage />} />

                {/* Clinical */}
                <Route
                  path="clinical"
                  element={
                    <ModuleGate module="CLINICAL">
                      <ClinicalPage />
                    </ModuleGate>
                  }
                />

                {/* Dental */}
                <Route
                  path="dental"
                  element={
                    <ModuleGate module="DENTAL">
                      <DentalPage />
                    </ModuleGate>
                  }
                />

                {/* Eye Clinic */}
                <Route
                  path="eye"
                  element={
                    <ModuleGate module="EYE">
                      <EyeClinicPage />
                    </ModuleGate>
                  }
                />

                {/* Pharmacy */}
                <Route path="pharmacy" element={<PharmacyPage />} />

                {/* Lab */}
                <Route
                  path="lab"
                  element={
                    <ModuleGate module="LAB">
                      <LabPage />
                    </ModuleGate>
                  }
                />

                {/* Billing */}
                <Route path="billing" element={<BillingPage />} />

                {/* Insurance */}
                <Route
                  path="insurance"
                  element={
                    <ModuleGate module="INSURANCE">
                      <InsurancePage />
                    </ModuleGate>
                  }
                />

                {/* Inventory */}
                <Route path="inventory" element={<InventoryPage />} />

                {/* Reports */}
                <Route path="reports" element={<ReportsPage />} />

                {/* Profile */}
                <Route path="profile" element={<ProfilePage />} />

                {/* Branches */}
                <Route path="branches" element={<BranchesPage />} />

                {/* Admin (restricted) */}
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        "SYS_ADMIN",
                        "SUPER_ADMIN",
                        "MED_SUPT",
                        "DISTRICT_HD",
                      ]}
                    />
                  }
                >
                  <Route index element={<AdminPage />} />
                </Route>
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ModulesProvider>
    </AuthProvider>
  );
}
