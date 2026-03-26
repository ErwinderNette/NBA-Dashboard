import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/services/authService";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast({
        title: "Fehler",
        description: "Token fehlt oder ist ungueltig.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Fehler",
        description: "Die Passwoerter stimmen nicht ueberein.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(token, password);
      toast({
        title: "Passwort aktualisiert",
        description: "Du kannst dich jetzt mit deinem neuen Passwort anmelden.",
      });
      navigate("/login");
    } catch (err) {
      const description = isAxiosError(err)
        ? err.response?.data?.error || "Das Passwort konnte nicht zurueckgesetzt werden."
        : "Das Passwort konnte nicht zurueckgesetzt werden.";
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
            <CardTitle className="text-2xl font-bold text-gray-800">Neues Passwort setzen</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700">Neues Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-700">Passwort bestaetigen</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#009fe3] hover:bg-[#0088cc] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Speichern..." : "Passwort speichern"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
