
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "publisher" | "advertiser">;
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const location = useLocation();
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  const userRole = localStorage.getItem("userRole") as "admin" | "publisher" | "advertiser" | "pending" | null;
  const mustCompleteProfile = localStorage.getItem("userMustCompleteProfile") === "true";

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (mustCompleteProfile && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }

  if (!mustCompleteProfile && location.pathname === "/complete-profile") {
    if (userRole === "admin") return <Navigate to="/admin-dashboard" replace />;
    if (userRole === "advertiser") return <Navigate to="/advertiser-dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  const hasAllowedRole =
    !!userRole && userRole !== "pending" && allowedRoles?.includes(userRole);

  if (allowedRoles && !hasAllowedRole) {
    if (userRole === "admin") return <Navigate to="/admin-dashboard" replace />;
    if (userRole === "advertiser") return <Navigate to="/advertiser-dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
