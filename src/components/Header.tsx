
import { useMemo, useState } from "react";
import {
  User,
  LogOut,
  LayoutDashboard,
  Settings,
  Shield,
  Upload,
  History,
  ClipboardCheck,
  Clock3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authService } from "@/services/authService";
import { sessionMeta } from "@/utils/sessionMeta";
import { useAvatar } from "@/hooks/useAvatar";

const Header = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const userEmail = localStorage.getItem("userEmail") || "publisher@email.de";
  const userName = localStorage.getItem("userName") || "Benutzer";
  const userRole = localStorage.getItem("userRole") || "publisher";
  const avatarUrl = localStorage.getItem("userAvatarUrl") || "";
  const avatarVersion = localStorage.getItem("userAvatarUpdatedAt") || "";
  const { avatarObjectUrl } = useAvatar({ avatarUrl, avatarVersion });
  const lastLogin = localStorage.getItem("userLastLoginAt");
  const lastAction = sessionMeta.getLastAction();
  const lastLoginText = useMemo(() => {
    if (!lastLogin) return "Heute";
    const date = new Date(lastLogin);
    if (Number.isNaN(date.getTime())) return "Heute";
    return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  }, [lastLogin]);
  const lastActionText = useMemo(() => {
    if (!lastAction?.action) return "Noch keine Aktion gespeichert";
    return `${lastAction.action}`;
  }, [lastAction]);
  const roleBadgeClass =
    userRole === "admin"
      ? "bg-gray-100 text-gray-700"
      : userRole === "advertiser"
      ? "bg-fuchsia-100 text-fuchsia-700"
      : "bg-sky-100 text-sky-700";

  const handleLogout = () => {
    authService.logout();
    
    toast({
      title: "Erfolgreich abgemeldet",
      description: "Sie wurden sicher abgemeldet.",
    });
    
    navigate("/login");
  };

  const navigateRoleHome = () => {
    sessionMeta.setLastAction("Dashboard geoeffnet");
    if (userRole === "admin") {
      navigate("/admin-dashboard");
      return;
    }
    if (userRole === "advertiser") {
      navigate("/advertiser-dashboard");
      return;
    }
    navigate("/dashboard");
  };

  const handleRoleAction = (action: "upload" | "recent" | "validations" | "settings") => {
    if (action === "upload") {
      sessionMeta.setLastAction("Upload-Bereich geoeffnet");
      navigate("/dashboard#upload");
      toast({
        title: "Upload-Bereich geoeffnet",
        description: "Du kannst direkt eine neue Datei hochladen.",
      });
      return;
    }
    if (action === "recent") {
      sessionMeta.setLastAction("Letzte Aktivitaet geoeffnet");
      navigateRoleHome();
      toast({
        title: "Letzte Aktivitaet",
        description: "Hier findest du deine zuletzt bearbeiteten Dateien.",
      });
      return;
    }
    if (action === "validations") {
      sessionMeta.setLastAction("Validierungen geoeffnet");
      navigate("/admin-dashboard");
      toast({
        title: "Validierungen",
        description: "Du bist jetzt im Adminbereich fuer Validierungen.",
      });
      return;
    }
    sessionMeta.setLastAction("Einstellungen geoeffnet");
    navigate("/settings");
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        {/* Logo/Brand */}
        <div className="flex items-center space-x-2">
          <img 
            src="/lovable-uploads/d8f0bf8e-1d1b-4046-bdfb-33bd1b356167.png" 
            alt="NBA-Dashboard Logo" 
            className="w-8 h-8 object-contain flex-shrink-0"
          />
          <h1 className="text-xl font-semibold text-gray-800">NBA-Dashboard</h1>
        </div>
        
        {/* User Info */}
        <div className="flex items-center space-x-3">
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto rounded-xl px-2 py-1 text-gray-700 hover:bg-gray-50 hover:shadow-sm transition-all duration-200"
                onMouseEnter={() => setIsMenuOpen(true)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center shadow-sm overflow-hidden">
                    {avatarObjectUrl ? (
                      <img
                        src={avatarObjectUrl}
                        alt={`${userName} Avatar`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User size={16} className="text-white" />
                    )}
                  </div>
                  <span className="text-sm font-medium truncate max-w-[180px]" title={userEmail}>{userEmail}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 rounded-xl"
              onMouseLeave={() => setIsMenuOpen(false)}
            >
              <DropdownMenuLabel className="pb-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{userName}</span>
                  <span className="text-xs text-gray-500">{userEmail}</span>
                  <span className={`mt-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleBadgeClass}`}>
                    {userRole}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <Clock3 size={12} />
                    Letzter Login: {lastLoginText}
                  </span>
                  <span className="text-[11px] text-gray-500">Letzte Aktion: {lastActionText}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="pt-0 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
                Quick Actions
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={navigateRoleHome} className="cursor-pointer">
                <LayoutDashboard size={14} className="mr-2" />
                Dashboard
              </DropdownMenuItem>
              {userRole === "publisher" && (
                <DropdownMenuItem onClick={() => handleRoleAction("upload")} className="cursor-pointer">
                  <Upload size={14} className="mr-2" />
                  Upload starten
                </DropdownMenuItem>
              )}
              {(userRole === "publisher" || userRole === "advertiser") && (
                <DropdownMenuItem onClick={() => handleRoleAction("recent")} className="cursor-pointer">
                  <History size={14} className="mr-2" />
                  Zuletzt bearbeitet
                </DropdownMenuItem>
              )}
              {userRole === "admin" && (
                <DropdownMenuItem onClick={() => navigate("/admin-dashboard")} className="cursor-pointer">
                  <Shield size={14} className="mr-2" />
                  Nutzerverwaltung
                </DropdownMenuItem>
              )}
              {userRole === "admin" && (
                <DropdownMenuItem onClick={() => handleRoleAction("validations")} className="cursor-pointer">
                  <ClipboardCheck size={14} className="mr-2" />
                  Validierungen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleRoleAction("settings")} className="cursor-pointer">
                <Settings size={14} className="mr-2" />
                Einstellungen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="pt-0 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
                Session
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
                <LogOut size={14} className="mr-2" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-800 md:hidden"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
