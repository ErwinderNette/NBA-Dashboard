
import { User } from "lucide-react";

const Header = () => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        {/* Logo/Brand */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-pink-500 rounded transform rotate-45"></div>
          <h1 className="text-xl font-semibold text-gray-800">NBA-Plattform</h1>
        </div>
        
        {/* User Info */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          <span className="text-gray-700 text-sm font-medium">publisher@mail.de</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
