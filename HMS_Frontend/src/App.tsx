import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ModulesProvider } from "@/contexts/ModulesContext";
import { ModuleGate } from "@/components/ui/ModuleGate";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import PatientsPage from "@/pages/patients/PatientsPage";
import AppointmentsPage from "@/pages/appointments/AppointmentsPage";
import ClinicalPage from "@/pages/clinical/ClinicalPage";
import DentalPage from "@/pages/dental/DentalPage";
import EyeClinicPage from "@/pages/eye/EyeClinicPage";
import PharmacyPage from "@/pages/pharmacy/PharmacyPage";
import LabPage from "@/pages/lab/LabPage";
import BillingPage from "@/pages/billing/BillingPage";
import InsurancePage from "@/pages/insurance/InsurancePage";
import InventoryPage from "@/pages/inventory/InventoryPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import BranchesPage from "@/pages/branches/BranchesPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import AdminPage from "@/pages/admin/AdminPage";
import { NotFoundPage, UnauthorizedPage } from "@/pages/errors/ErrorPages";

export default function App() {
  return (
    <AuthProvider>
      <ModulesProvider>
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
      </ModulesProvider>
    </AuthProvider>
  );
}
