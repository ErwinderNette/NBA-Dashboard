import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import Cropper, { Area, Point } from "react-easy-crop";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { sessionMeta } from "@/utils/sessionMeta";
import { authService } from "@/services/authService";
import { useAvatar } from "@/hooks/useAvatar";
import { getCroppedImageBlob } from "@/utils/imageCrop";
import { Camera, Loader2, Trash2, User } from "lucide-react";

type Density = "normal" | "compact";

interface SettingsState {
  notifications: {
    uploadUpdates: boolean;
    validationResults: boolean;
    weeklyDigest: boolean;
  };
  density: Density;
}

const SETTINGS_KEY = "nbaDashboardSettings";

const defaultSettings: SettingsState = {
  notifications: {
    uploadUpdates: true,
    validationResults: true,
    weeklyDigest: false,
  },
  density: "normal",
};

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const userName = localStorage.getItem("userName") || "Benutzer";
  const userEmail = localStorage.getItem("userEmail") || "-";
  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem("userAvatarUrl") || "");
  const [avatarVersion, setAvatarVersion] = useState(localStorage.getItem("userAvatarUpdatedAt") || "");
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [cropPosition, setCropPosition] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const {
    avatarObjectUrl,
    hasAvatar,
    reloadAvatar,
    clearAvatar,
  } = useAvatar({ avatarUrl, avatarVersion });

  const viewClass = useMemo(
    () => (settings.density === "compact" ? "space-y-4" : "space-y-6"),
    [settings.density]
  );

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as SettingsState;
      if (parsed?.notifications && parsed?.density) {
        setSettings(parsed);
      }
    } catch {
      // ignore malformed localStorage
    }
  }, []);

  useEffect(() => {
    if (!selectedAvatar) {
      setAvatarPreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(selectedAvatar);
    setAvatarPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedAvatar]);

  useEffect(() => {
    return () => {
      if (cropImageSrc.startsWith("blob:")) {
        URL.revokeObjectURL(cropImageSrc);
      }
    };
  }, [cropImageSrc]);

  const saveSettings = (next: SettingsState) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    sessionMeta.setLastAction("Einstellungen gespeichert");
    toast({
      title: "Einstellungen gespeichert",
      description: "Deine Anpassungen wurden lokal uebernommen.",
    });
  };

  const validateAvatarFile = (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxBytes = 5 * 1024 * 1024;
    if (!allowedTypes.includes(file.type)) {
      return "Nur JPG, PNG oder WEBP sind erlaubt.";
    }
    if (file.size > maxBytes) {
      return "Maximale Dateigroesse: 5 MB.";
    }
    return null;
  };

  const handleAvatarSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAvatarError(null);
    if (!file) {
      setSelectedAvatar(null);
      return;
    }
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarError(validationError);
      setSelectedAvatar(null);
      return;
    }
    if (cropImageSrc.startsWith("blob:")) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropImageSrc(URL.createObjectURL(file));
    setCropPosition({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropDialogOpen(true);
  };

  const handleApplyCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) {
      setAvatarError("Bitte waehle zuerst einen Bildausschnitt.");
      return;
    }
    setIsCropping(true);
    setAvatarError(null);
    try {
      const blob = await getCroppedImageBlob(cropImageSrc, croppedAreaPixels, 512, "image/jpeg", 0.92);
      const file = new File([blob], `avatar_${Date.now()}.jpg`, { type: "image/jpeg" });
      setSelectedAvatar(file);
      setCropDialogOpen(false);
      if (cropImageSrc.startsWith("blob:")) {
        URL.revokeObjectURL(cropImageSrc);
      }
      setCropImageSrc("");
    } catch {
      setAvatarError("Der Bildausschnitt konnte nicht erstellt werden.");
    } finally {
      setIsCropping(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!selectedAvatar) return;
    setIsAvatarLoading(true);
    setAvatarError(null);
    try {
      const response = await authService.uploadAvatar(selectedAvatar);
      const nextVersion = String(Date.now());
      localStorage.setItem("userAvatarUrl", response.avatar_url || "");
      localStorage.setItem("userAvatarUpdatedAt", nextVersion);
      setAvatarUrl(response.avatar_url || "");
      setAvatarVersion(nextVersion);
      setSelectedAvatar(null);
      await reloadAvatar();
      sessionMeta.setLastAction("Profilfoto aktualisiert");
      toast({
        title: "Profilfoto gespeichert",
        description: "Dein neues Foto ist jetzt aktiv.",
      });
    } catch {
      setAvatarError("Upload fehlgeschlagen. Bitte versuche es erneut.");
      toast({
        title: "Upload fehlgeschlagen",
        description: "Das Profilfoto konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsAvatarLoading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setIsAvatarLoading(true);
    setAvatarError(null);
    try {
      if (selectedAvatar) {
        setSelectedAvatar(null);
        setIsAvatarLoading(false);
        return;
      }
      await authService.deleteAvatar();
      const nextVersion = String(Date.now());
      localStorage.setItem("userAvatarUrl", "");
      localStorage.setItem("userAvatarUpdatedAt", nextVersion);
      setAvatarUrl("");
      setAvatarVersion(nextVersion);
      setSelectedAvatar(null);
      clearAvatar();
      sessionMeta.setLastAction("Profilfoto entfernt");
      toast({
        title: "Profilfoto entfernt",
        description: "Es wird wieder das Standard-Icon angezeigt.",
      });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        setAvatarUrl("");
        setAvatarVersion(String(Date.now()));
        clearAvatar();
      } else {
        setAvatarError("Profilfoto konnte nicht entfernt werden.");
      }
      toast({
        title: "Loeschen fehlgeschlagen",
        description: "Das Profilfoto konnte nicht entfernt werden.",
        variant: "destructive",
      });
    } finally {
      setIsAvatarLoading(false);
    }
  };

  const currentAvatarSrc = avatarPreview || avatarObjectUrl;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Einstellungen</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profile">Profil</TabsTrigger>
                <TabsTrigger value="notifications">Benachrichtigungen</TabsTrigger>
                <TabsTrigger value="appearance">Darstellung</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-6">
                <div className={viewClass}>
                  <div className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="h-20 w-20 overflow-hidden rounded-full border bg-slate-100">
                        {currentAvatarSrc ? (
                          <img
                            src={currentAvatarSrc}
                            alt="Profilfoto"
                            className="h-full w-full object-cover"
                            onError={() => setAvatarUrl("")}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-500">
                            <User size={28} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="avatar-upload">Profilfoto</Label>
                        <Input
                          id="avatar-upload"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={handleAvatarSelection}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={handleAvatarUpload}
                            disabled={!selectedAvatar || isAvatarLoading}
                          >
                            {isAvatarLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Speichern...
                              </>
                            ) : (
                              <>
                                <Camera className="mr-2 h-4 w-4" />
                                Foto speichern
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleAvatarDelete}
                            disabled={isAvatarLoading || (!hasAvatar && !avatarPreview && !selectedAvatar)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {selectedAvatar ? "Auswahl verwerfen" : "Entfernen"}
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500">Erlaubt: JPG, PNG, WEBP bis 5 MB.</p>
                        {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input id="profile-name" value={userName} disabled />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-email">E-Mail</Label>
                    <Input id="profile-email" value={userEmail} disabled />
                  </div>
                  <p className="text-sm text-slate-500">
                    Profilwerte kommen aus dem Login und sind aktuell schreibgeschuetzt.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="mt-6">
                <div className={viewClass}>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="upload-updates">Upload-Updates</Label>
                    <Switch
                      id="upload-updates"
                      checked={settings.notifications.uploadUpdates}
                      onCheckedChange={(checked) =>
                        saveSettings({
                          ...settings,
                          notifications: { ...settings.notifications, uploadUpdates: checked },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="validation-results">Validierungsergebnisse</Label>
                    <Switch
                      id="validation-results"
                      checked={settings.notifications.validationResults}
                      onCheckedChange={(checked) =>
                        saveSettings({
                          ...settings,
                          notifications: { ...settings.notifications, validationResults: checked },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="weekly-digest">Wochen-Update</Label>
                    <Switch
                      id="weekly-digest"
                      checked={settings.notifications.weeklyDigest}
                      onCheckedChange={(checked) =>
                        saveSettings({
                          ...settings,
                          notifications: { ...settings.notifications, weeklyDigest: checked },
                        })
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="appearance" className="mt-6">
                <div className={viewClass}>
                  <div className="grid gap-3">
                    <Label>Dichte</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={settings.density === "normal" ? "default" : "outline"}
                        onClick={() => saveSettings({ ...settings, density: "normal" })}
                      >
                        Normal
                      </Button>
                      <Button
                        type="button"
                        variant={settings.density === "compact" ? "default" : "outline"}
                        onClick={() => saveSettings({ ...settings, density: "compact" })}
                      >
                        Kompakt
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">
                    Die Darstellung wird lokal gespeichert und kann pro Geraet variieren.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Profilfoto zuschneiden</DialogTitle>
            <DialogDescription>
              Wähle den sichtbaren Ausschnitt für dein Profilbild.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-slate-900">
              {cropImageSrc && (
                <Cropper
                  image={cropImageSrc}
                  crop={cropPosition}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCropPosition}
                  onZoomChange={setZoom}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Zoom</Label>
              <Slider
                min={1}
                max={3}
                step={0.01}
                value={[zoom]}
                onValueChange={(value) => setZoom(value[0] ?? 1)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCropDialogOpen(false);
                if (cropImageSrc.startsWith("blob:")) {
                  URL.revokeObjectURL(cropImageSrc);
                }
                setCropImageSrc("");
              }}
              disabled={isCropping}
            >
              Abbrechen
            </Button>
            <Button type="button" onClick={handleApplyCrop} disabled={isCropping}>
              {isCropping ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verarbeite...
                </>
              ) : (
                "Ausschnitt uebernehmen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
