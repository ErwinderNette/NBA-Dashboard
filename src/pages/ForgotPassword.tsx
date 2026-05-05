import { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/services/authService";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await authService.forgotPassword(email.trim().toLowerCase());
      toast({
        title: "Anfrage gesendet",
        description: "Wenn ein Konto existiert, wurde ein Reset-Link versendet.",
      });
    } catch (err) {
      const description = isAxiosError(err)
        ? err.response?.data?.error || "Die Anfrage konnte nicht verarbeitet werden."
        : "Die Anfrage konnte nicht verarbeitet werden.";
      toast({
        title: "Fehler",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(to bottom right, #009fe3, #e91e63)" }}>
      <div className="w-full max-w-md p-6">
        <Card className="bg-white shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Passwort vergessen</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700">E-Mail Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nachbuchungen@uppr.de"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#009fe3] hover:bg-[#0088cc] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Senden..." : "Reset-Link anfordern"}
              </Button>
            </form>
            <div className="mt-5 text-center">
              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-800">
                Zurück zum Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
