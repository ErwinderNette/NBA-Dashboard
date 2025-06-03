
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simuliere kurze Ladzeit
    setTimeout(() => {
      // Prüfe Login-Daten für Publisher-Oberfläche
      if (email === "publisher@email.de" && password === "1234") {
        // Speichere Login-Status
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userRole", "publisher");
        localStorage.setItem("userEmail", email);
        
        toast({
          title: "Login erfolgreich",
          description: "Willkommen in der NBA-Plattform!",
        });
        
        // Weiterleitung zur Hauptseite
        navigate("/dashboard");
      } else {
        toast({
          title: "Login fehlgeschlagen",
          description: "E-Mail oder Passwort ist falsch.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #009fe3, #e91e63)' }}>
      <div className="w-full max-w-md p-6">
        {/* Logo und Titel */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <img 
              src="/lovable-uploads/d8f0bf8e-1d1b-4046-bdfb-33bd1b356167.png" 
              alt="NBA-Plattform Logo" 
              className="w-12 h-12"
            />
            <h1 className="text-3xl font-bold text-gray-800">NBA-Plattform</h1>
          </div>
        </div>

        {/* Login Card */}
        <Card className="bg-white shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700">E-Mail Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nachbuchungen@uppr.de"
                  required
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="******************"
                  required
                  className="w-full"
                />
              </div>

              <div className="text-center">
                <a href="#" className="text-sm text-gray-600 hover:text-gray-800">
                  Passwort vergessen?
                </a>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-[#009fe3] hover:bg-[#0088cc] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Anmelden..." : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
