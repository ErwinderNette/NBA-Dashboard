
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check credentials and determine user type
    if (email === 'publisher@email.de' && password === '1234') {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userRole', 'publisher');
      localStorage.setItem('userEmail', email);
      
      toast({
        title: "Erfolgreich angemeldet",
        description: "Willkommen bei der NBA-Plattform",
      });
      
      navigate('/dashboard');
    } else if (email === 'advertiser@mail.de' && password === '4321') {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userRole', 'advertiser');
      localStorage.setItem('userEmail', email);
      
      toast({
        title: "Erfolgreich angemeldet", 
        description: "Willkommen bei der NBA-Plattform",
      });
      
      navigate('/advertiser-dashboard');
    } else {
      toast({
        title: "Anmeldung fehlgeschlagen",
        description: "Ungültige E-Mail oder Passwort",
        variant: "destructive"
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/lovable-uploads/d8f0bf8e-1d1b-4046-bdfb-33bd1b356167.png" 
              alt="NBA-Plattform Logo" 
              className="w-12 h-12"
            />
          </div>
          <CardTitle className="text-2xl text-center">NBA-Plattform</CardTitle>
          <CardDescription className="text-center">
            Melden Sie sich mit Ihren Zugangsdaten an
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="ihre@email.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? 'Anmelden...' : 'Anmelden'}
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Test-Zugänge:</strong></p>
              <p>Publisher: publisher@email.de / 1234</p>
              <p>Advertiser: advertiser@mail.de / 4321</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
