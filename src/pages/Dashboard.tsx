import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";
import CampaignSelector from "@/components/CampaignSelector";
import { uploadService } from "@/services/uploadService";
import { UploadItem } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const Dashboard = () => {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [completedFiles, setCompletedFiles] = useState<UploadItem[]>([]); // NEU
  const { toast } = useToast();

  // Lädt Uploads aus dem Backend
  const fetchUploads = async () => {
    try {
      const uploads = await uploadService.getUploads();
      // Offene und abgeschlossene Dateien trennen
      const open = uploads.filter(u =>
        u.status === 'pending' ||
        u.status === 'returned_to_publisher' ||
        u.status === 'assigned' ||
        u.status === 'feedback'
      );
      const completed = uploads.filter(u => u.status === 'completed');
      setFiles(open);
      setCompletedFiles(completed);
    } catch (err) {
      // Fehlerbehandlung (optional Toast)
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  // Callback für Upload-Erfolg
  const handleUploadSuccess = (fileInfo) => {
    setFiles(prev => [
      {
        id: Date.now(),
        filename: fileInfo.name,
        upload_date: new Date().toISOString(),
        file_size: 0,
        content_type: '',
        uploaded_by: fileInfo.advertiser || '',
        status: 'pending',
      },
      ...(prev ?? [])
    ]);
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
        fetchUploads();
      } catch (err) {
        toast({
          title: "Fehler beim Löschen",
          description: "Die Datei konnte nicht gelöscht werden.",
          variant: "destructive",
        });
      }
    } else {
      setFiles(prev => prev.filter(f => f !== file));
    }
  };

  // Datei abschließen
  const handleComplete = async (file) => {
    if (!file.id) return;
    try {
      await uploadService.completeUpload(file.id);
      toast({
        title: "Datei abgeschlossen",
        description: `${file.name || file.filename} wurde abgeschlossen.`,
      });
      // Datei verschieben
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setCompletedFiles(prev => [file, ...prev]);
      fetchUploads(); // Backend-Sync
    } catch (err) {
      toast({
        title: "Fehler beim Abschließen",
        description: "Die Datei konnte nicht abgeschlossen werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <UploadArea onUploadSuccess={handleUploadSuccess} />
        <FileList
          files={(files ?? []).map(file => ({
            name: file.filename,
            uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
            advertiser: file.uploaded_by || '',
            status: file.status,
            statusColor: file.status === 'pending' ? '#e91e63' : file.status === 'approved' ? '#4caf50' : '#2196f3',
            id: file.id,
          }))}
          onDelete={handleDelete}
          onComplete={handleComplete}
        />
        {/* Neue Section für abgeschlossene Dateien als Dropdown/Accordion */}
        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                files={(completedFiles ?? []).map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
                  status: file.status,
                  statusColor: '#4caf50',
                  id: file.id,
                }))}
                // Keine Aktionen für abgeschlossene Dateien
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Dashboard;
