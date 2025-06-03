
import { useState, useCallback } from "react";
import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const UploadArea = () => {
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      toast({
        title: "Dateien hochgeladen",
        description: `${files.length} Datei(en) erfolgreich hochgeladen`,
      });
      console.log("Dropped files:", files);
    }
  }, [toast]);

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        toast({
          title: "Dateien ausgewählt",
          description: `${files.length} Datei(en) ausgewählt`,
        });
        console.log("Selected files:", files);
      }
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
