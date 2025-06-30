import { useState, useCallback } from "react";
import { ArrowDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import React from "react";
import { uploadService } from '@/services/uploadService';

// Define types for the data structures based on the backend
interface UploadItem {
  id: number;
  filename: string;
  upload_date: string; // Assuming date comes as a string from backend
  file_size: number;
  content_type: string;
  uploaded_by: string;
  status: string; // e.g., 'pending', 'approved', 'rejected'
  advertiser_count?: number; // Assuming this might come from the backend query
}

interface Advertiser {
  id: number; // Assuming SERIAL PRIMARY KEY becomes number
  name: string;
  email: string;
}

// Define the props type for AdminFileList
interface AdminFileListProps {
  uploads: UploadItem[];
  advertisers: Advertiser[];
  onGrantAccess: (uploadId: number, advertiserId: number, expiresAt: Date) => Promise<void>;
}

const AdminFileList = ({ uploads, advertisers, onGrantAccess }: AdminFileListProps) => {
  const { toast } = useToast();
  
  // Temporäre Auswahl für Dropdown-Werte
  const [tempAssignments, setTempAssignments] = useState<Record<number, number>>({});

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500';
      case 'assigned': // Changed 'assigned' to 'granted' based on new schema logic
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'rejected':
        return 'bg-red-500';
      case 'granted': // Added 'granted' status
         return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Genehmigt';
      case 'assigned': // Changed 'assigned' to 'granted'
        return 'Zugewiesen';
      case 'pending':
        return 'Ausstehend';
      case 'rejected':
        return 'Abgelehnt';
       case 'granted': // Added 'granted' status
        return 'Zugewiesen';
      default:
        return 'Unbekannt';
    }
  };

  const handleAdvertiserSelection = (uploadId: number, advertiserId: string) => {
    setTempAssignments(prev => ({
      ...prev,
      [uploadId]: parseInt(advertiserId, 10)
    }));
  };

  const handleAdvertiserAssignment = async (uploadId: number) => {
    const selectedAdvertiserId = tempAssignments[uploadId];
    if (!selectedAdvertiserId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie zuerst einen Advertiser aus",
        variant: "destructive",
      });
      return;
    }

    // ** IMPORTANT: You need to add logic to select/input the expiration date **
    // For now, let's use a placeholder Date (e.g., 1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Example: Access for 1 year

    try {
      await onGrantAccess(uploadId, selectedAdvertiserId, expiresAt);

      toast({
        title: "Advertiser zugewiesen",
        description: `Datei wurde zugewiesen`,
      });

      // Temporäre Auswahl entfernen
      setTempAssignments(prev => {
        const newTemp = { ...prev };
        delete newTemp[uploadId];
        return newTemp;
      });

    } catch (error) {
       toast({
        title: "Fehler bei Zuweisung",
        description: "Die Zuweisung konnte nicht durchgeführt werden",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = (uploadId: number, newStatus: 'approved' | 'rejected') => {
    console.log(`Changing status for upload ${uploadId} to ${newStatus}`);
    toast({
      title: "Statusänderung (Backend notwendig)",
      description: `Funktionalität zum Ändern des Status im Backend muss implementiert werden.`,
    });
  };

  const handleDownload = async (uploadId: number, filename: string) => {
    try {
      await uploadService.downloadFile(uploadId, filename);
      toast({
        title: "Download gestartet",
        description: `Die Datei ${filename} wird heruntergeladen.`,
      });
    } catch (err) {
      toast({
        title: "Fehler beim Download",
        description: "Die Datei konnte nicht heruntergeladen werden.",
        variant: "destructive",
      });
    }
  };

  const handleForward = (uploadId: number) => {
    console.log(`Forwarding file (likely covered by access grant): ${uploadId}`);
    toast({
      title: "Weiterleiten (über Zuweisung)",
      description: `Die Datei wird über die Advertiser-Zuweisung zugänglich gemacht.`,
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Admin - Upload Verwaltung</h3>
      <p className="text-gray-600 mb-6">
        Prüfe und weise Uploads den entsprechenden Advertisern zu.
      </p>
      
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-3">Dateiname</div>
          <div className="col-span-2">Upload Datum</div>
          <div className="col-span-2">Publisher</div>
          <div className="col-span-2">Advertiser</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Aktionen</div>
        </div>
        
        {/* File rows */}
        {uploads.map((file) => (
          <div 
            key={file.id}
            className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg"
          >
            <div className="col-span-3 text-gray-800 font-medium">
              {file.filename}
            </div>
            <div className="col-span-2 text-gray-600">
              {new Date(file.upload_date).toLocaleDateString()}
            </div>
            <div className="col-span-2 text-gray-800">
              {file.uploaded_by}
            </div>
            <div className="col-span-2">
              {file.status === 'pending' ? (
                <div className="flex items-center space-x-2">
                  <Select 
                    value={tempAssignments[file.id]?.toString() || ""} 
                    onValueChange={(value) => handleAdvertiserSelection(file.id, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Advertiser wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {advertisers.map((advertiser) => (
                        <SelectItem key={advertiser.id} value={advertiser.id.toString()}>
                          {advertiser.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tempAssignments[file.id] && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAdvertiserAssignment(file.id)}
                      className="p-1 h-8 w-8 hover:bg-blue-50"
                    >
                      <Send size={14} className="text-blue-600" />
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-gray-800">
                  {getStatusText(file.status)}
                </span>
              )}
            </div>
            <div className="col-span-1 flex items-center">
              <div 
                className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}
                title={getStatusText(file.status)}
              />
            </div>
            <div className="col-span-2 flex items-center space-x-2">
              {file.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(file.id, 'approved')}
                    className="text-green-600 border-green-300 hover:bg-green-50"
                  >
                    ✓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(file.id, 'rejected')}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    ✗
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(file.id, file.filename)}
                className="p-1 h-8 w-8 hover:bg-gray-200"
              >
                <ArrowDown size={16} className="text-gray-600" />
              </Button>
              {file.status === 'granted' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleForward(file.id)}
                  className="p-1 h-8 w-8 hover:bg-gray-200"
                >
                  →
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const UploadArea = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadStatus("idle");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadStatus("uploading");
    try {
      // Hier deinen Upload-Request einbauen
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Dummy-Upload
      setUploadStatus("success");
    } catch (err) {
      setUploadStatus("error");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleFileChange}
      />
      <label htmlFor="file-upload" className="cursor-pointer text-blue-600 border px-4 py-2 rounded border-blue-600 hover:bg-blue-50">
        Datei auswählen
      </label>
      {selectedFile && (
        <div className="mt-4 flex flex-col items-center">
          <span className="text-gray-700">{selectedFile.name}</span>
          <button
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={handleUpload}
            disabled={uploadStatus === "uploading"}
          >
            {uploadStatus === "uploading" ? "Hochladen..." : "Senden"}
          </button>
        </div>
      )}
      {uploadStatus === "success" && <div className="mt-2 text-green-600">Upload erfolgreich!</div>}
      {uploadStatus === "error" && <div className="mt-2 text-red-600">Fehler beim Upload.</div>}
    </div>
  );
};

export default AdminFileList;
