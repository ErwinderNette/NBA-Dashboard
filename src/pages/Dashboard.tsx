import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";
import CampaignSelector from "@/components/CampaignSelector";
import { uploadService } from "@/services/uploadService";
import { UploadItem } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const { toast } = useToast();

  // Lädt Uploads aus dem Backend
  const fetchUploads = async () => {
    try {
      const uploads = await uploadService.getUploads();
      setFiles(uploads);
    } catch (err) {
      // Fehlerbehandlung (optional Toast)
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  // Callback für Upload-Erfolg
  const handleUploadSuccess = (fileInfo) => {
    // Datei sofort optimistisch anzeigen
    setFiles(prev => [
      {
        id: Date.now(), // temporäre ID
        filename: fileInfo.name,
        upload_date: new Date().toISOString(),
        file_size: 0,
        content_type: '',
        uploaded_by: fileInfo.advertiser || '',
        status: 'pending',
      },
      ...(prev ?? [])
    ]);
    // Nach kurzer Zeit mit Backend synchronisieren
    setTimeout(() => {
      fetchUploads();
    }, 2000);
    window.dispatchEvent(new Event("uploads-updated"));
  };

  // Datei löschen
  const handleDelete = async (file) => {
    if (file.id) {
      try {
        await uploadService.deleteUpload(file.id);
        setFiles(prev => prev.filter(f => f.id !== file.id));
        toast({
          title: "Datei gelöscht",
          description: `${file.name || file.filename} wurde erfolgreich gelöscht.`,
        });
        fetchUploads(); // Backend-Sync
      } catch (err) {
        toast({
          title: "Fehler beim Löschen",
          description: "Die Datei konnte nicht gelöscht werden.",
          variant: "destructive",
        });
      }
    } else {
      // Optimistische Datei (noch nicht im Backend)
      setFiles(prev => prev.filter(f => f !== file));
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <UploadArea onUploadSuccess={handleUploadSuccess} />
        <FileList files={(files ?? []).map(file => ({
          name: file.filename,
          uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
          advertiser: file.uploaded_by || '',
          status: file.status,
          statusColor: file.status === 'pending' ? '#e91e63' : file.status === 'approved' ? '#4caf50' : '#2196f3',
          id: file.id,
          // downloadUrl: ggf. ergänzen, wenn vorhanden
        }))} onDelete={handleDelete} />
      </div>
    </div>
  );
};

export default Dashboard;
