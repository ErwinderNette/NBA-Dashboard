import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/services/authService";

const OTHER_COMPANY_OPTION = "__other_company__";

const CompleteProfile = () => {
  const [role, setRole] = useState<"publisher" | "advertiser">("publisher");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companyOptionsLoading, setCompanyOptionsLoading] = useState(false);
  const [companyOptionsError, setCompanyOptionsError] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    company: false,
    contactName: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const needsCustomCompany = selectedCompany === OTHER_COMPANY_OPTION;
  const companyValue = needsCustomCompany ? customCompany.trim() : selectedCompany.trim();
  const companyError =
    touched.company && companyValue.length < 2
      ? "Bitte Unternehmen auswaehlen oder mindestens 2 Zeichen eingeben."
      : null;
  const contactNameError =
    touched.contactName && contactName.trim().length > 0 && contactName.trim().length < 2
      ? "Ansprechpartner muss mindestens 2 Zeichen haben."
      : null;
  const isFormValid = useMemo(() => !companyError && !contactNameError && companyValue.length >= 2, [companyError, contactNameError, companyValue]);

  useEffect(() => {
    let mounted = true;
    const loadCompanies = async () => {
      setCompanyOptionsLoading(true);
      setCompanyOptionsError(null);
      try {
        const options = await authService.getCompanyOptions();
        if (!mounted) return;
        setCompanyOptions(options.map((item) => item.value).filter((item) => item.trim() !== ""));
      } catch {
        if (!mounted) return;
        setCompanyOptions([]);
        setCompanyOptionsError("Firmenliste konnte nicht geladen werden. Bitte Unternehmen manuell eingeben.");
      } finally {
        if (mounted) {
          setCompanyOptionsLoading(false);
        }
      }
    };
    void loadCompanies();
    return () => {
      mounted = false;
    };
  }, []);

  const navigateByRole = (resolvedRole: string) => {
    if (resolvedRole === "admin") {
      navigate("/admin-dashboard");
      return;
    }
    if (resolvedRole === "advertiser") {
      navigate("/advertiser-dashboard");
      return;
    }
    navigate("/dashboard");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({
      company: true,
      contactName: true,
    });
    if (!isFormValid) {
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await authService.completeProfile({
        role,
        company: companyValue,
        contact_name: contactName.trim() || undefined,
      });
      toast({
        title: "Profil abgeschlossen",
        description: "Rolle und Unternehmen wurden gespeichert.",
      });
      navigateByRole(response.role);
    } catch (err) {
      const description = isAxiosError(err)
        ? err.response?.data?.error || "Profil konnte nicht abgeschlossen werden."
        : "Profil konnte nicht abgeschlossen werden.";
      toast({
        title: "Fehler",
        description,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(to bottom right, #009fe3, #e91e63)" }}>
      <div className="w-full max-w-md p-6">
        <Card className="bg-white shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Rolle auswaehlen</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-gray-700">Zu welcher Gruppe gehoerst du?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === "publisher"
                        ? "border-[#009fe3] bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600"
                    }`}
                    onClick={() => setRole("publisher")}
                  >
                    Publisher
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === "advertiser"
                        ? "border-[#009fe3] bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600"
                    }`}
                    onClick={() => setRole("advertiser")}
                  >
                    Advertiser
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company" className="text-gray-700">Unternehmen</Label>
                {companyOptions.length > 0 && !companyOptionsError ? (
                  <Select
                    value={selectedCompany}
                    onValueChange={(value) => {
                      setSelectedCompany(value);
                      setTouched((prev) => ({ ...prev, company: true }));
                    }}
                  >
                    <SelectTrigger id="company" className={companyError ? "border-red-400 focus:ring-red-200" : ""}>
                      <SelectValue placeholder={companyOptionsLoading ? "Lade Firmen..." : "Firma auswaehlen"} />
                    </SelectTrigger>
                    <SelectContent>
                      {companyOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_COMPANY_OPTION}>Andere Firma...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="company"
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, company: true }))}
                    placeholder="Unternehmen eingeben"
                    required
                    className={companyError ? "border-red-400 focus-visible:ring-red-200" : ""}
                  />
                )}
                {needsCustomCompany && companyOptions.length > 0 && !companyOptionsError && (
                  <Input
                    id="custom-company"
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, company: true }))}
                    placeholder="Unternehmen manuell eingeben"
                    required
                    className={companyError ? "border-red-400 focus-visible:ring-red-200" : ""}
                  />
                )}
                {companyOptionsError && <p className="text-xs text-amber-700">{companyOptionsError}</p>}
                {companyError && <p className="text-xs text-red-600">{companyError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-gray-700">Ansprechpartner (optional)</Label>
                <Input
                  id="contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, contactName: true }))}
                  placeholder="Max Mustermann"
                  className={contactNameError ? "border-red-400 focus-visible:ring-red-200" : ""}
                />
                {contactNameError && <p className="text-xs text-red-600">{contactNameError}</p>}
              </div>

              <Button
                type="submit"
                className="w-full bg-[#009fe3] hover:bg-[#0088cc] text-white"
                disabled={isSubmitting || !isFormValid}
              >
                {isSubmitting ? "Speichern..." : "Profil speichern"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompleteProfile;
