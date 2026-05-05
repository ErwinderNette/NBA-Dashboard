import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authService, AuthRole } from "@/services/authService";

const OTHER_COMPANY_OPTION = "__other_company__";

const Login = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companyOptionsLoading, setCompanyOptionsLoading] = useState(false);
  const [companyOptionsError, setCompanyOptionsError] = useState<string | null>(null);
  const [registerRole, setRegisterRole] = useState<"publisher" | "advertiser">("publisher");
  const [touched, setTouched] = useState({
    company: false,
    contactName: false,
    email: false,
    password: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleOriginWarning, setGoogleOriginWarning] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const googleIdentityRef = useRef("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const hasGoogleClientId = googleClientId !== "" && !googleClientId.startsWith("REPLACE_");
  const isRegisterMode = mode === "register";
  const needsCustomCompany = selectedCompany === OTHER_COMPANY_OPTION;
  const companyValue = needsCustomCompany ? customCompany.trim() : selectedCompany.trim();
  const showsRegisterResetHint =
    isRegisterMode &&
    formFeedback?.type === "error" &&
    /bereits|existiert|already/i.test(formFeedback.message);
  const companyError =
    isRegisterMode && touched.company && companyValue.length < 2
      ? "Bitte Unternehmen auswählen oder mindestens 2 Zeichen eingeben."
      : null;
  const contactNameError =
    isRegisterMode && touched.contactName && contactName.trim().length > 0 && contactName.trim().length < 2
      ? "Ansprechpartner muss mindestens 2 Zeichen haben."
      : null;
  const emailError =
    touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Bitte eine gueltige E-Mail-Adresse eingeben."
      : null;
  const passwordError =
    touched.password && (password.trim().length < (isRegisterMode ? 8 : 1))
      ? isRegisterMode
        ? "Passwort muss mindestens 8 Zeichen haben."
        : "Passwort darf nicht leer sein."
      : null;
  const isFormValid =
    !!email.trim() &&
    !!password.trim() &&
    (!isRegisterMode || !!companyValue) &&
    !companyError &&
    !contactNameError &&
    !emailError &&
    !passwordError;

  useEffect(() => {
    googleIdentityRef.current = (contactName.trim() || companyValue || "").trim();
  }, [contactName, companyValue]);

  useEffect(() => {
    if (!isRegisterMode) {
      return;
    }
    let mounted = true;
    const loadCompanies = async () => {
      setCompanyOptionsLoading(true);
      setCompanyOptionsError(null);
      try {
        const options = await authService.getCompanyOptions();
        if (!mounted) return;
        const values = options.map((item) => item.value).filter((item) => item.trim() !== "");
        setCompanyOptions(values);
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
  }, [isRegisterMode]);

  useEffect(() => {
    setFormFeedback(null);
  }, [mode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        setGoogleReady(true);
        window.clearInterval(timer);
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, []);

  const navigateByRole = useCallback((role: AuthRole) => {
    if (role === "pending") {
      navigate("/complete-profile");
      return;
    }
    if (role === "publisher") {
      navigate("/dashboard");
      return;
    }
    if (role === "advertiser") {
      navigate("/advertiser-dashboard");
      return;
    }
    if (role === "admin") {
      navigate("/admin-dashboard");
      return;
    }
    navigate("/dashboard");
  }, [navigate]);

  const getGoogleOriginWarning = useCallback(() => {
    const allowedOrigins = (import.meta.env.VITE_GOOGLE_ALLOWED_ORIGINS || "http://localhost:8080")
      .split(",")
      .map((entry: string) => entry.trim())
      .filter(Boolean);
    if (allowedOrigins.includes(window.location.origin)) {
      return null;
    }
    return `Google Origin nicht freigegeben: ${window.location.origin}. Erlaubt: ${allowedOrigins.join(", ")}`;
  }, []);

  useEffect(() => {
    const clientId = googleClientId;
    if (!clientId || !googleReady || !window.google?.accounts?.id) {
      return;
    }
    const gsiWindow = window as Window & {
      __nbaGsiInitialized?: boolean;
      __nbaGsiClientId?: string;
    };

    const originWarning = getGoogleOriginWarning();
    if (originWarning) {
      setGoogleOriginWarning(originWarning);
      return;
    }
    setGoogleOriginWarning(null);

    if (!gsiWindow.__nbaGsiInitialized || gsiWindow.__nbaGsiClientId !== clientId) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            toast({
              title: "Google-Login fehlgeschlagen",
              description: "Es wurde kein Google-Token geliefert.",
              variant: "destructive",
            });
            return;
          }

          setIsLoading(true);
          try {
            const data = await authService.googleAuth({
              idToken: response.credential,
              name: googleIdentityRef.current || undefined,
            });

            toast({
              title: "Login erfolgreich",
              description: "Willkommen in der NBA-Plattform!",
            });
            navigateByRole(data.role);
          } catch (err) {
            const description = extractErrorMessage(err, "Google-Login fehlgeschlagen.");
            toast({
              title: "Login fehlgeschlagen",
              description,
              variant: "destructive",
            });
          } finally {
            setIsLoading(false);
          }
        },
      });
      gsiWindow.__nbaGsiInitialized = true;
      gsiWindow.__nbaGsiClientId = clientId;
    }
  }, [googleReady, googleClientId, getGoogleOriginWarning, navigateByRole, toast]);

  useEffect(() => {
    if (!googleBtnRef.current || !googleReady || !hasGoogleClientId || !window.google?.accounts?.id) {
      return;
    }
    googleBtnRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: 340,
      text: mode === "register" ? "signup_with" : "signin_with",
      shape: "pill",
    });
  }, [mode, googleReady, hasGoogleClientId]);

  const extractErrorMessage = (err: unknown, fallback: string) => {
    if (isAxiosError(err)) {
      const backendMessage = err.response?.data?.error;
      if (typeof backendMessage === "string" && backendMessage.trim() !== "") {
        return backendMessage;
      }
      if (err.message.includes("Network Error")) {
        return "Backend nicht erreichbar. Bitte API-URL und CORS pruefen.";
      }
    }
    return fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      company: true,
      contactName: true,
      email: true,
      password: true,
    });
    if (!isFormValid) {
      return;
    }
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let data: { role: AuthRole };
      if (mode === "login") {
        data = await authService.login({ email: normalizedEmail, password });
      } else {
        data = await authService.register({
          company: companyValue,
          contact_name: contactName.trim() || undefined,
          email: normalizedEmail,
          password,
          role: registerRole,
        });
      }

      toast({
        title: mode === "login" ? "Login erfolgreich" : "Registrierung erfolgreich",
        description: "Willkommen in der NBA-Plattform!",
      });
      setFormFeedback({
        type: "success",
        message:
          mode === "login"
            ? "Login erfolgreich. Du wirst jetzt weitergeleitet."
            : "Registrierung erfolgreich. Dein Konto ist sofort einsatzbereit.",
      });
      navigateByRole(data.role);
    } catch (err) {
      const description = extractErrorMessage(
        err,
        mode === "login" ? "Login fehlgeschlagen." : "Registrierung fehlgeschlagen."
      );
      setFormFeedback({
        type: "error",
        message: description,
      });

      toast({
        title: mode === "login" ? "Login fehlgeschlagen" : "Registrierung fehlgeschlagen",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #009fe3, #e91e63)' }}>
      <div className="w-full max-w-md p-6">
        {/* Logo und Titel */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <img 
              src="/lovable-uploads/d8f0bf8e-1d1b-4046-bdfb-33bd1b356167.png" 
              alt="NBA-Dashboard Logo" 
              className="w-12 h-12 object-contain flex-shrink-0"
            />
            <h1 className="text-3xl font-bold text-gray-800">NBA-Dashboard</h1>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="bg-white/95 backdrop-blur-sm shadow-2xl border-white/50">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">
              {mode === "login" ? "Willkommen zurück" : "Konto erstellen"}
            </CardTitle>
            <p className="text-sm text-gray-500 pt-1">
              {mode === "login"
                ? "Melde dich an und mach direkt an deinen Dateien weiter."
                : "In unter 1 Minute kannst du dein Konto erstellen und loslegen."}
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative mb-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
              <span
                className={`pointer-events-none absolute top-1 h-[calc(100%-0.5rem)] w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-200 ${
                  mode === "register" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                className={`relative z-10 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  mode === "login" ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={`relative z-10 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  mode === "register" ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => setMode("register")}
              >
                Registrieren
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {formFeedback && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    formFeedback.type === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {formFeedback.message}
                </div>
              )}

              {isRegisterMode && (
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
                        <SelectValue placeholder={companyOptionsLoading ? "Lade Firmen..." : "Firma auswählen"} />
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
              )}

              {isRegisterMode && (
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
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700">E-Mail Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  placeholder="nachbuchungen@uppr.de"
                  required
                  className={`w-full transition-all duration-200 ${
                    emailError ? "border-red-400 focus-visible:ring-red-200" : ""
                  }`}
                  aria-invalid={!!emailError || showsRegisterResetHint}
                />
                {emailError && <p className="text-xs text-red-600">{emailError}</p>}
                {showsRegisterResetHint && (
                  <p className="text-xs text-gray-600">
                    Diese E-Mail scheint bereits registriert zu sein. Nutze{" "}
                    <a href="/forgot-password" className="text-[#009fe3] hover:underline">
                      Passwort vergessen
                    </a>{" "}
                    fuer einen schnellen Wiedereinstieg.
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="******************"
                  required
                  className={`w-full transition-all duration-200 ${
                    passwordError ? "border-red-400 focus-visible:ring-red-200" : ""
                  }`}
                />
                {isRegisterMode && (
                  <p className="text-xs text-gray-500">Mindestens 8 Zeichen.</p>
                )}
                {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
              </div>

              {isRegisterMode && (
                <div className="space-y-2">
                  <Label className="text-gray-700">Rolle</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        registerRole === "publisher"
                          ? "border-[#009fe3] bg-blue-50 text-blue-700 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50/50"
                      }`}
                      onClick={() => setRegisterRole("publisher")}
                    >
                      Publisher
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        registerRole === "advertiser"
                          ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-fuchsia-200 hover:bg-fuchsia-50/50"
                      }`}
                      onClick={() => setRegisterRole("advertiser")}
                    >
                      Advertiser
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {registerRole === "publisher"
                      ? "Publisher laedt Dateien hoch und verwaltet Uebergaben."
                      : "Advertiser arbeitet Feedback ein und gibt Dateien zurueck."}
                  </p>
                </div>
              )}

              {mode === "login" && (
                <div className="text-center">
                  <a href="/forgot-password" className="text-sm text-gray-600 hover:text-gray-800">
                    Passwort vergessen?
                  </a>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-[#009fe3] hover:bg-[#0088cc] text-white transition-all duration-200 hover:-translate-y-0.5"
                disabled={isLoading || !isFormValid}
              >
                {isLoading
                  ? mode === "login" ? "Anmelden..." : "Registrieren..."
                  : mode === "login" ? "Anmelden" : "Registrieren"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200"></div>
              <span className="text-xs text-gray-500">oder</span>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>

            <div className="flex justify-center">
              {hasGoogleClientId ? (
                <div ref={googleBtnRef} />
              ) : (
                <p className="text-xs text-gray-500">
                  Google Login ist deaktiviert (VITE_GOOGLE_CLIENT_ID fehlt oder ist ein Platzhalter).
                </p>
              )}
            </div>
            {googleOriginWarning && (
              <p className="mt-2 text-xs text-red-600 text-center leading-relaxed">{googleOriginWarning}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
