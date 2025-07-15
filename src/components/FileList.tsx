import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadService } from '@/services/uploadService';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import React, { useState } from "react";

interface FileItem {
  name: string;
  uploadDate: string;
  advertiser: string;
  status?: string;
  statusColor?: string;
  downloadUrl?: string;
  id?: number;
}

interface FileListProps {
  files: FileItem[];
  onDelete?: (file: FileItem) => void;
}

const FileList = ({ files, onDelete }: FileListProps) => {
  const getStatusColor = (statusColor?: string) => {
    return statusColor || 'bg-pink-500';
  };

  const handleDownload = async (id?: number, name?: string) => {
    if (!id) return;
    await uploadService.downloadFile(id, name);
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

  const handleDeleteClick = (file: FileItem) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (fileToDelete && onDelete) {
      onDelete(fileToDelete);
    }
    setDeleteDialogOpen(false);
    setFileToDelete(null);
  };

  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du die Datei <b>{fileToDelete?.name}</b> wirklich löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktueller Stand</h3>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr] gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
            <div>Löschen</div>
            <div>Dateiname</div>
            <div>Upload Datum</div>
            <div>Advertiser</div>
            <div>Status</div>
            <div>Download</div>
          </div>
          {/* File rows */}
          {(files ?? []).length === 0 && <div className="py-4 text-gray-500">Keine Dateien gefunden.</div>}
          {(files ?? []).map((file, index) => (
            <div
              key={index}
              className={`grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center relative ${file.status === 'pending' ? 'text-gray-400' : ''}`}
            >
              {/* Overlay für pending entfernt */}
              <div className="flex justify-center">
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(file)}
                    className="p-1 h-8 w-8"
                  >
                    ×
                  </Button>
                )}
              </div>
              <div className="text-gray-800 font-medium truncate" title={file.name}>{file.name}</div>
              <div className="text-gray-600">{file.uploadDate}</div>
              <div className="text-gray-800">{file.advertiser}</div>
              <div className="flex items-center">
                {file.status === 'pending' ? (
                  <span className="text-pink-600 font-semibold">In Bearbeitung</span>
                ) : file.status === 'returned_to_publisher' ? (
                  <span className="text-blue-400 font-semibold">Feedback erhalten</span>
                ) : (
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(file.statusColor)}`}></div>
                )}
              </div>
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(file.id, file.name)}
                  className="p-1 h-8 w-8 hover:bg-blue-100"
                  title={file.name ? `Download ${file.name}` : 'Download'}
                >
                  <ArrowDown size={16} className="text-blue-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default FileList;
