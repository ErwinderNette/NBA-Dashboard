
import Header from "@/components/Header";
import AdvertiserFileList from "@/components/AdvertiserFileList";
import { useEffect, useState } from "react";
import { uploadService } from "@/services/uploadService";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import FileList from "@/components/FileList";
import { UploadItem } from "@/types/upload";

const AdvertiserDashboard = () => {
  const [openFiles, setOpenFiles] = useState<UploadItem[]>([]);
  const [completedFiles, setCompletedFiles] = useState<UploadItem[]>([]);

  useEffect(() => {
    const fetchUploads = async () => {
      const uploads = await uploadService.getUploads();
      setOpenFiles(uploads.filter(u => u.status !== 'completed'));
      setCompletedFiles(uploads.filter(u => u.status === 'completed'));
    };
    fetchUploads();
    // Optional: Event-Listener für Upload-Updates
    const reload = () => fetchUploads();
    window.addEventListener("uploads-updated", reload);
    return () => window.removeEventListener("uploads-updated", reload);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e91e63, #ad1457)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Offene Dateien */}
        <AdvertiserFileList uploads={openFiles} />
        {/* Accordion für abgeschlossene Dateien */}
        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                files={completedFiles.map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
                  status: file.status,
                  statusColor: '#4caf50',
                  id: file.id,
                }))}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default AdvertiserDashboard;
