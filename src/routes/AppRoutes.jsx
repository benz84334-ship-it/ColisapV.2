import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { ROLES, WORKSPACE_ROLES } from '../utils/constants.js';

const Login = lazy(() => import('../pages/auth/Login.jsx'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard.jsx'));
const Members = lazy(() => import('../pages/members/Members.jsx'));
const ClaimantApplication = lazy(() => import('../pages/claimant/ClaimantApplication.jsx'));
const DormancyNotifications = lazy(() => import('../pages/dormancy/DormancyNotifications.jsx'));
const Reports = lazy(() => import('../pages/reports/Reports.jsx'));
const Settings = lazy(() => import('../pages/settings/Settings.jsx'));
const NotFound = lazy(() => import('../pages/NotFound.jsx'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner label="Preparing Colisap workspace" />}>
      <Routes>
        <Route element={<Login />} path="/login" />
        <Route element={<ProtectedRoute roles={WORKSPACE_ROLES} />}>
          <Route element={<AppLayout />}>
            <Route element={<Navigate replace to="/dashboard" />} index />
            <Route element={<Dashboard />} path="/dashboard" />
            <Route element={<Members />} path="/members" />
            <Route element={<DormancyNotifications />} path="/dormancy-notifications" />
            <Route element={<Reports />} path="/reports" />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER]} />}>
          <Route element={<AppLayout />}>
            <Route element={<Members />} path="/request-approval" />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={[ROLES.STAFF]} />}>
          <Route element={<AppLayout />}>
            <Route element={<ClaimantApplication />} path="/claimant-application" />
            <Route element={<Members />} path="/request-member" />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
          <Route element={<AppLayout />}>
            <Route element={<Navigate replace to="/settings" />} path="/users" />
            <Route element={<Settings />} path="/settings" />
          </Route>
        </Route>
        <Route element={<Navigate replace to="/dashboard" />} path="/" />
        <Route element={<NotFound />} path="*" />
      </Routes>
    </Suspense>
  );
}
