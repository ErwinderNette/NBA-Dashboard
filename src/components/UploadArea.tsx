import { useState, useCallback, useEffect } from "react";
import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadService } from '@/services/uploadService';

interface UploadAreaProps {
  onUploadSuccess?: (fileInfo: {
    name: string;
    uploadDate: string;
    advertiser: string;
    statusColor?: string;
    downloadUrl?: string;
  }) => void;
}

const UploadArea = ({ onUploadSuccess }: UploadAreaProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const file = files[0];
      const allowedTypes = [".csv", ".xls", ".xlsx"];
      if (!allowedTypes.some(type => file.name.endsWith(type))) {
        toast({
          title: 'Ungültiger Dateityp',
          description: 'Nur CSV- oder Excel-Dateien sind erlaubt.',
          variant: 'destructive',
        });
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      await uploadService.uploadFile(formData);
      toast({
        title: 'Upload erfolgreich',
        description: `${file.name} wurde hochgeladen.`,
      });
      if (onUploadSuccess) {
        onUploadSuccess({
          name: file.name,
          uploadDate: new Date().toLocaleDateString('de-DE'),
          advertiser: 'Advertiser', // Platzhalter
          statusColor: '#e91e63', // pink
          // downloadUrl: '', // Optional: Backend-URL
        });
      }
    } catch (err) {
      toast({
        title: 'Fehler beim Upload',
        description: 'Die Datei konnte nicht hochgeladen werden.',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, [toast, onUploadSuccess]);

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      handleFiles(files);
    };
    input.click();
  };

  return (
    <div
      className={`
        bg-white rounded-2xl shadow-lg border-2 border-dashed p-12 text-center transition-all duration-200
        ${isDragOver 
          ? 'border-pink-500 bg-pink-50' 
          : 'border-gray-300 hover:border-gray-400'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <Cloud size={64} className="text-gray-600" />
          <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-600">
              <path d="M12 4l8 8h-6v8h-4v-8H4l8-8z" fill="currentColor"/>
            </svg>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800">HIER Upload</h2>
        
        <p className="text-gray-600 text-lg max-w-md">
          Hochladen per Drag and Drop oder{" "}
          <Button 
            variant="outline" 
            onClick={handleFileSelect}
            className="inline-flex items-center px-4 py-1 text-sm border-pink-500 text-pink-600 hover:bg-pink-50"
          >
            Datei auswählen
          </Button>
        </p>
      </div>
    </div>
  );
};

export default UploadArea;
