import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';

export default function ProtectedRoute({ roles = [] }) {
  const { isAuthenticated, isAuthReady, hasRole } = useAuth();
  const location = useLocation();

  if (!isAuthReady) {
    return <LoadingSpinner label="Checking access" />;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (!hasRole(roles)) {
    return <Navigate replace to="/dashboard" />;
  }

  return <Outlet />;
}
