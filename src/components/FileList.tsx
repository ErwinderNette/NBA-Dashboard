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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import React, { useState, useEffect } from "react";

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
  onComplete?: (file: FileItem) => void; // NEU: Callback für Abschluss
}

const FileList = ({ files, onDelete, onComplete }: FileListProps) => {
  const getStatusColor = (statusColor?: string) => {
    return statusColor || 'bg-pink-500';
  };

  const handleDownload = async (id?: number, name?: string) => {
    if (!id) return;
    await uploadService.downloadFile(id, name);
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [validationData, setValidationData] = useState<Record<number, any>>({});
  const [loadingValidations, setLoadingValidations] = useState<Set<number>>(new Set());

  // Lade Validierungsergebnisse für alle Dateien
  useEffect(() => {
    const loadValidations = async () => {
      console.log("🔍 [FileList] Lade Validierungen für Dateien:", files.map(f => ({ id: f.id, name: f.name, status: f.status })));
      const newValidationData: Record<number, any> = { ...validationData };
      const loadingSet = new Set<number>();

      for (const file of files) {
        if (!file.id) {
          console.log("⚠️ [FileList] Datei ohne ID gefunden:", file.name);
          continue;
        }
        // Nur laden wenn Status "assigned", "feedback" oder "feedback_submitted" ist
        if (file.status === 'assigned' || file.status === 'feedback' || file.status === 'feedback_submitted') {
          // Überspringe, wenn bereits geladen
          if (validationData[file.id]) {
            console.log(`✅ [FileList] Validierung bereits geladen für UploadID=${file.id}`);
            continue;
          }
          
          console.log(`🔄 [FileList] Lade Validierung für UploadID=${file.id}, Status=${file.status}`);
          loadingSet.add(file.id);
          try {
            const validation = await uploadService.getValidation(file.id);
            if (validation) {
              console.log(`✅ [FileList] Validierung gefunden für UploadID=${file.id}:`, validation);
              newValidationData[file.id] = validation;
            } else {
              console.log(`ℹ️ [FileList] Keine Validierung für UploadID=${file.id} (null zurückgegeben)`);
            }
          } catch (err: any) {
            if (err?.response?.status === 404) {
              console.log(`ℹ️ [FileList] Keine Validierung für UploadID=${file.id} (404 - noch nicht validiert)`);
            } else {
              console.error(`❌ [FileList] Fehler beim Laden der Validierung für UploadID=${file.id}:`, err);
            }
          } finally {
            loadingSet.delete(file.id);
          }
        } else {
          console.log(`⏭️ [FileList] Überspringe UploadID=${file.id}, Status=${file.status} (nicht im richtigen Status)`);
        }
      }

      console.log("📊 [FileList] Validierungsdaten nach Laden:", Object.keys(newValidationData).map(k => ({ id: k, hasData: !!newValidationData[Number(k)] })));
      
      // Nur aktualisieren, wenn sich etwas geändert hat
      const hasChanges = Object.keys(newValidationData).length !== Object.keys(validationData).length ||
        Object.keys(newValidationData).some(key => newValidationData[Number(key)] !== validationData[Number(key)]);
      
      if (hasChanges) {
        console.log("💾 [FileList] Aktualisiere Validierungsdaten");
        setValidationData(newValidationData);
      } else {
        console.log("⏸️ [FileList] Keine Änderungen, überspringe Update");
      }
      setLoadingValidations(loadingSet);
    };

    loadValidations();

    // Höre auf Upload-Updates, um Validierungen neu zu laden
    const handleUploadsUpdate = () => {
      console.log("🔄 [FileList] Upload-Update Event empfangen, lade Validierungen neu");
      loadValidations();
    };
    window.addEventListener("uploads-updated", handleUploadsUpdate);

    return () => {
      window.removeEventListener("uploads-updated", handleUploadsUpdate);
    };
  }, [files]);

  // Berechne Status-Zusammenfassung für eine Datei
  const getStatusSummary = (fileId?: number): { bestätigt: number; offen: number; storniert: number; ausgezahlt: number } => {
    if (!fileId) return { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0 };
    
    const validation = validationData[fileId];
    if (!validation?.rows) return { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0 };

    const summary = { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0 };

    for (const row of validation.rows) {
      if (!row.cells) continue;
      const statusCell = row.cells["Status in der uppr Performance Platform"];
      if (statusCell && typeof statusCell === "object" && "value" in statusCell) {
        const statusValue = statusCell.value;
        if (statusValue === "bestätigt" || statusValue === "1") summary.bestätigt++;
        else if (statusValue === "offen" || statusValue === "0") summary.offen++;
        else if (statusValue === "storniert" || statusValue === "2") summary.storniert++;
        else if (statusValue === "ausgezahlt" || statusValue === "3") summary.ausgezahlt++;
      }
    }

    return summary;
  };

  // Download Validierungsergebnisse als CSV
  const handleDownloadComparison = async (file: FileItem) => {
    if (!file.id) return;

    const validation = validationData[file.id];
    if (!validation?.rows) return;

    try {
      // Lade die Originaldatei, um die Header zu bekommen
      const fileContent = await uploadService.getFileContent(file.id);
      const headers = fileContent.data[0] || [];

      // Erstelle CSV-Inhalt
      const csvRows: string[] = [];

      // Header-Zeile
      const headerRow = [...headers, "Status in der uppr Performance Platform"];
      csvRows.push(headerRow.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","));

      // Daten-Zeilen
      for (let i = 1; i < fileContent.data.length; i++) {
        const originalRow = fileContent.data[i] || [];
        const validationRow = validation.rows[i - 1];
        
        const csvRow: string[] = [];
        
        // Original-Spalten
        for (let j = 0; j < headers.length; j++) {
          const value = originalRow[j] || "";
          csvRow.push(`"${String(value).replace(/"/g, '""')}"`);
        }

        // Status-Spalte aus Validierung
        if (validationRow?.cells) {
          const statusCell = validationRow.cells["Status in der uppr Performance Platform"];
          const statusValue = statusCell && typeof statusCell === "object" && "value" in statusCell
            ? statusCell.value
            : "";
          csvRow.push(`"${String(statusValue).replace(/"/g, '""')}"`);
        } else {
          csvRow.push(`""`);
        }

        csvRows.push(csvRow.join(","));
      }

      // Erstelle Blob und Download
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${file.name.replace(/\.[^/.]+$/, "")}_Vergleich_Netzwerk.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Fehler beim Download der Vergleichsergebnisse:", err);
    }
  };

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
          <div className="grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr,1fr] gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
            <div>Löschen</div>
            <div>Dateiname</div>
            <div>Upload Datum</div>
            <div>Advertiser</div>
            <div>Status</div>
            <div>Download</div>
            <div>Aktionen</div> {/* NEU */}
          </div>
          {/* File rows */}
          {(files ?? []).length === 0 && <div className="py-4 text-gray-500">Keine Dateien gefunden.</div>}
          {(files ?? []).map((file, index) => (
            <div
              key={index}
              className={`grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr,1fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center relative ${file.status === 'pending' ? 'text-gray-400' : ''}`}
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
                  <span className="text-green-600 font-semibold">Feedback erhalten</span>
                ) : file.status === 'assigned' ? (
                  <span className="text-yellow-600 font-semibold">Prüfung Advertiser</span>
                ) : file.status === 'feedback' ? (
                  <span className="text-blue-400 font-semibold">Verarbeitung ins Netzwerk</span>
                ) : file.status === 'feedback_submitted' ? (
                  <span className="text-blue-400 font-semibold">Verarbeitung ins Netzwerk</span>
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
              {/* NEU: Aktionen-Spalte */}
              <div className="flex justify-center">
                {file.status === 'returned_to_publisher' && onComplete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-600 border-green-600 hover:bg-green-50"
                    onClick={() => onComplete(file)}
                  >
                    Abschließen
                  </Button>
                ) : file.id && validationData[file.id] ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"
                          onClick={() => handleDownloadComparison(file)}
                        >
                          Vergleich Netzwerk
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1">
                          <div>{getStatusSummary(file.id).bestätigt} bestätigt</div>
                          <div>{getStatusSummary(file.id).offen} offen</div>
                          <div>{getStatusSummary(file.id).storniert} storniert</div>
                          <div>{getStatusSummary(file.id).ausgezahlt} ausgezahlt</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  // Debug-Info für fehlenden Button
                  file.id && (file.status === 'assigned' || file.status === 'feedback' || file.status === 'feedback_submitted') ? (
                    <span className="text-xs text-gray-400" title={`Debug: file.id=${file.id}, validationData[${file.id}]=${validationData[file.id] ? 'exists' : 'missing'}`}>
                      ⏳
                    </span>
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default FileList;
