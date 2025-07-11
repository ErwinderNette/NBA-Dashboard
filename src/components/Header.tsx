
import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Header = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const userEmail = localStorage.getItem("userEmail") || "publisher@email.de";

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    
    toast({
      title: "Erfolgreich abgemeldet",
      description: "Sie wurden sicher abgemeldet.",
    });
    
    navigate("/login");
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
          <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          <span className="text-gray-700 text-sm font-medium">{userEmail}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-800"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
