import Header from "@/components/Header";
import AdminFileList from "@/components/AdminFileList";
import { useState, useEffect, useMemo } from "react";
import { uploadService } from "@/services/uploadService";
import { advertiserService } from "@/services/advertiserService";
import { UploadItem, Advertiser } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const AdminDashboard = () => {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch both uploads and advertisers in parallel
        const [uploadsData, advertisersData] = await Promise.all([
          uploadService.getUploads(),
          advertiserService.getAdvertisers()
        ]);

        setUploads(uploadsData);
        setAdvertisers(advertisersData);
      } catch (err) {
        setError("Daten konnten nicht geladen werden. Bitte versuche es erneut.");
        toast({
          title: "Fehler",
          description: "Daten konnten nicht geladen werden. Bitte versuche es erneut.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Listener für Upload-Updates
    const reload = () => fetchData();
    window.addEventListener("uploads-updated", reload);
    return () => window.removeEventListener("uploads-updated", reload);
  }, [toast]);

  const handleGrantAccess = async (uploadId: number, advertiserId: number, expiresAt: Date) => {
    try {
      await uploadService.grantAccess(uploadId, advertiserId, expiresAt);
      
      // Update the local state to reflect the change
      setUploads(prevUploads => 
        prevUploads.map(upload => 
          upload.id === uploadId 
            ? { ...upload, status: 'granted' }
            : upload
        )
      );

      toast({
        title: "Erfolg",
        description: "Zugriff wurde erfolgreich vergeben.",
      });
    } catch (err) {
      toast({
        title: "Fehler",
        description: "Zugriff konnte nicht vergeben werden. Bitte erneut versuchen.",
        variant: "destructive",
      });
    }
  };

  const kpis = useMemo(() => {
    const open = uploads.filter((u) => u.status !== "completed").length;
    const assigned = uploads.filter((u) => u.status === "assigned" || u.status === "granted").length;
    const completed = uploads.filter((u) => u.status === "completed").length;
    const lastSevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trend = uploads.filter((u) => new Date(u.upload_date).getTime() >= lastSevenDays).length;
    return { open, assigned, completed, trend };
  }, [uploads]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <section className="grid gap-3 md:grid-cols-4">
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Offen</p>
              <p className="text-2xl font-semibold">{kpis.open}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Zugewiesen</p>
              <p className="text-2xl font-semibold">{kpis.assigned}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Abgeschlossen</p>
              <p className="text-2xl font-semibold">{kpis.completed}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Trend (7 Tage)</p>
              <p className="text-2xl font-semibold">+{kpis.trend}</p>
            </CardContent>
          </Card>
        </section>
        <AdminFileList 
          advertisers={advertisers}
          onGrantAccess={handleGrantAccess}
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
