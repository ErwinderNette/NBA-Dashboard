import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, X as LucideX, Edit, Save, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import React from "react";
import { uploadService } from '@/services/uploadService';
import api from "@/services/api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Define types for the data structures based on the backend
interface UploadItem {
  id: number;
  filename: string;
  upload_date: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  status: string;
  advertiser_count?: number;
  last_modified_by?: string;
  assigned_advertiser_email?: string;
}

interface Advertiser {
  id: number;
  name: string;
  email: string;
}

interface UserWithCompany {
  id: number;
  name: string;
  email: string;
  company: string;
  role: string;
}

interface AdminFileListProps {
  advertisers: Advertiser[];
  onGrantAccess: (uploadId: number, advertiserId: number, expiresAt: Date) => Promise<void>;
}

const AdminFileList = ({ advertisers, onGrantAccess }: AdminFileListProps) => {
  const { toast } = useToast();

  const [tempAssignments, setTempAssignments] = useState<Record<number, number>>({});
  const [allUsers, setAllUsers] = useState<UserWithCompany[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<UploadItem | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [fileData, setFileData] = useState<Record<number, string[][]>>({});
  const [originalFileData, setOriginalFileData] = useState<Record<number, string[][]>>({});
  const [isLoadingFile, setIsLoadingFile] = useState<Record<number, boolean>>({});
  const [isSavingFile, setIsSavingFile] = useState<Record<number, boolean>>({});

  // Validation State
  const [validationData, setValidationData] = useState<Record<number, any>>({});
  const [isValidating, setIsValidating] = useState<Record<number, boolean>>({});
  const [validationError, setValidationError] = useState<Record<number, string | null>>({});
  const [validationProgress, setValidationProgress] = useState<Record<number, number>>({});

  const validationIntervalsRef = useRef<Record<number, ReturnType<typeof setInterval> | null>>({});

  function startFakeProgress(fileId: number): ReturnType<typeof setInterval> {
    // etwas niedriger starten
    setValidationProgress(prev => ({ ...prev, [fileId]: 2 }));
    let value = 2;
  
    const interval = setInterval(() => {
      // kleinere Schritte + Zufall => dauert spürbar länger
      const step = Math.random() * 3 + 0.6; // ~0.8–3.8 pro Tick
      value += step;
  
      // langsam gegen 90% "auslaufen"
      if (value > 70) value += Math.random() * 1.2; // mini-boost, aber langsam
      if (value >= 90) value = 90;
      
  
      setValidationProgress(prev => ({ ...prev, [fileId]: value }));
  
      if (value >= 90) {
        clearInterval(interval);
      }
    }, 520); // Tick langsamer -> insgesamt ca. 15–25s bis 90%
  
    return interval;
  }

  function stopFakeProgress(fileId: number, finalValue = 100) {
    const interval = validationIntervalsRef.current[fileId];
    if (interval) clearInterval(interval);
    validationIntervalsRef.current[fileId] = null;
    setValidationProgress(prev => ({ ...prev, [fileId]: finalValue }));
  }

  // Reload uploads
  const reloadUploads = useCallback(() => {
    uploadService.getUploads().then(setUploads);
  }, []);

  useEffect(() => {
    reloadUploads();
    const interval = setInterval(reloadUploads, 10000);
    return () => clearInterval(interval);
  }, [reloadUploads]);

  useEffect(() => {
    api.get("/users").then(res => setAllUsers(res.data)).catch(() => setAllUsers([]));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500';
      case 'assigned':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'rejected':
        return 'bg-red-500';
      case 'granted':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Genehmigt';
      case 'assigned':
        return 'Zugewiesen';
      case 'feedback':
      case 'feedback_submitted':
        return 'Feedback eingereicht';
      case 'pending':
        return 'Ausstehend';
      case 'rejected':
        return 'Abgelehnt';
      case 'granted':
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

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    try {
      await onGrantAccess(uploadId, selectedAdvertiserId, expiresAt);

      toast({
        title: "Advertiser zugewiesen",
        description: `Datei wurde zugewiesen`,
      });

      reloadUploads();

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

  const handleReturnToPublisher = async (uploadId: number) => {
    try {
      await uploadService.returnToPublisher(uploadId);
      toast({
        title: "Datei zurück an Publisher",
        description: "Die Datei wurde an den ursprünglichen Publisher zurückgeschickt.",
      });
      reloadUploads();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Die Datei konnte nicht zurückgeschickt werden.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (file: UploadItem) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    // 1) File content laden (nur falls noch nicht geladen)
    if (!fileData[id]) {
      setIsLoadingFile(prev => ({ ...prev, [id]: true }));
      try {
        const result = await uploadService.getFileContent(id);
        const safeData = Array.isArray(result.data)
          ? result.data.filter(r => r != null).map(r => Array.isArray(r) ? r : [])
          : [];

        setFileData(prev => ({ ...prev, [id]: safeData }));
        setOriginalFileData(prev => ({ ...prev, [id]: JSON.parse(JSON.stringify(safeData)) }));
      } catch (err) {
        toast({
          title: "Fehler",
          description: "Datei konnte nicht geladen werden.",
          variant: "destructive",
        });
        setExpandedId(null);
      } finally {
        setIsLoadingFile(prev => ({ ...prev, [id]: false }));
      }
    }

    // 2) Validation immer frisch laden
    setIsValidating(prev => ({ ...prev, [id]: true }));
    setValidationError(prev => ({ ...prev, [id]: null }));

    validationIntervalsRef.current[id] = startFakeProgress(id);

    try {
      const v = await uploadService.validateUpload(id);
      stopFakeProgress(id, 100);
      console.log(`[handleExpand] Validation response for file ${id}:`, v);
      if (v?.rows && v.rows.length > 0) {
        console.log(`[handleExpand] First row cells:`, v.rows[0]?.cells);
        console.log(`[handleExpand] First row cells keys:`, v.rows[0]?.cells ? Object.keys(v.rows[0].cells) : []);
        // ✅ NEU: Prüfe explizit nach Status
        const statusKey = "Status in der uppr Performance Platform";
        if (v.rows[0]?.cells?.[statusKey]) {
          console.log(`[handleExpand] ✅ Status gefunden:`, v.rows[0].cells[statusKey]);
        } else {
          console.log(`[handleExpand] ❌ Status NICHT gefunden!`);
          console.log(`[handleExpand] Alle Keys:`, Object.keys(v.rows[0]?.cells || {}));
          console.log(`[handleExpand] Cells-Objekt:`, JSON.stringify(v.rows[0]?.cells, null, 2));
        }
      }
      setValidationData(prev => {
        const newData = { ...prev, [id]: v };
        console.log(`[handleExpand] Setting validation data for file ${id}`);
        console.log(`[handleExpand] New validationData keys:`, Object.keys(newData));
        console.log(`[handleExpand] New validationData[${id}]:`, newData[id]);
        return newData;
      });
      // ✅ Debug: Prüfe ob Validierungsdaten gesetzt wurden
      console.log(`[handleExpand] Validation data set for file ${id}`);
      console.log(`[handleExpand] validationData[${id}] after set:`, validationData[id]); // ⚠️ Das wird noch den alten Wert zeigen!
      // ✅ Besser: Prüfe direkt nach dem Setzen
      setTimeout(() => {
        console.log(`[handleExpand] validationData[${id}] after timeout:`, validationData[id]);
      }, 100);
    } catch (err: any) {
      stopFakeProgress(id, 0);

      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Validation fehlgeschlagen";

      setValidationError(prev => ({ ...prev, [id]: detail }));
      toast({
        title: "Validation Fehler",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setIsValidating(prev => ({ ...prev, [id]: false }));
        setValidationProgress(prev => ({ ...prev, [id]: 0 }));
      }, 600);
    }
  };

  const handleCellChange = (fileId: number, rowIndex: number, colIndex: number, value: string) => {
    const currentData = fileData[fileId] || [];
    const newData = [...currentData];

    if (!newData[rowIndex] || !Array.isArray(newData[rowIndex])) {
      newData[rowIndex] = [];
    }

    while (newData[rowIndex].length <= colIndex) {
      newData[rowIndex].push("");
    }

    newData[rowIndex][colIndex] = value;
    setFileData(prev => ({ ...prev, [fileId]: newData }));
  };

  const handleSaveFile = async (id: number) => {
    if (fileData[id]) {
      setIsSavingFile(prev => ({ ...prev, [id]: true }));
      try {
        await uploadService.saveFileContent(id, fileData[id]);
        setOriginalFileData(prev => ({ ...prev, [id]: JSON.parse(JSON.stringify(fileData[id])) }));
        toast({
          title: "Erfolg",
          description: "Datei wurde erfolgreich gespeichert.",
        });
        reloadUploads();
      } catch (err) {
        toast({
          title: "Fehler",
          description: "Datei konnte nicht gespeichert werden.",
          variant: "destructive",
        });
      } finally {
        setIsSavingFile(prev => ({ ...prev, [id]: false }));
      }
    }
    setExpandedId(null);
  };

  const hasFileChanges = (fileId: number): boolean => {
    if (!fileData[fileId] || !originalFileData[fileId]) return false;
    return JSON.stringify(fileData[fileId]) !== JSON.stringify(originalFileData[fileId]);
  };

  const confirmDelete = async () => {
    if (fileToDelete) {
      try {
        await uploadService.deleteUpload(fileToDelete.id);
        toast({
          title: "Datei gelöscht",
          description: `${fileToDelete.filename} wurde erfolgreich gelöscht.`,
        });
        reloadUploads();
      } catch (err) {
        toast({
          title: "Fehler beim Löschen",
          description: "Die Datei konnte nicht gelöscht werden.",
          variant: "destructive",
        });
      }
    }
    setDeleteDialogOpen(false);
    setFileToDelete(null);
  };

  // ✅ holt den Wert einer Zelle aus validate-Response (falls vorhanden)
  const getCellValue = (
    fileId: number,
    rowIndex: number,
    colIndex: number
  ): string | null => {
    const headerRow = fileData[fileId]?.[0];
    const fieldName = headerRow?.[colIndex];
    const isStatusColumn = fieldName?.toLowerCase().includes("status");
    
    // ✅ Debug: Log für ALLE Aufrufe (auch für Datenzeilen)
    if (isStatusColumn || colIndex === 14) {
      console.log(`[getCellValue] Called for file ${fileId}, row ${rowIndex}, col ${colIndex}, fieldName: "${fieldName}"`);
      if (rowIndex === 0) {
        console.log(`[getCellValue] Header row - returning null`);
        console.log(`[getCellValue] validationData keys:`, Object.keys(validationData));
        console.log(`[getCellValue] validationData[${fileId}]:`, validationData[fileId]);
        return null; // Header-Zeile - früher return
      } else {
        console.log(`[getCellValue] Data row ${rowIndex - 1} - checking validation data`);
        console.log(`[getCellValue] validationData keys:`, Object.keys(validationData));
        console.log(`[getCellValue] validationData[${fileId}]:`, validationData[fileId]);
      }
    }
    
    const v = validationData[fileId];
    if (!v?.rows) {
      // ✅ Debug: Log wenn Validierungsdaten fehlen
      if (isStatusColumn && rowIndex === 1) {
        console.log(`[getCellValue] ❌ No validation data for file ${fileId}, rowIndex ${rowIndex}`);
        console.log(`[getCellValue] validationData keys:`, Object.keys(validationData));
        console.log(`[getCellValue] validationData[${fileId}]:`, validationData[fileId]);
      }
      return null;
    }
    if (rowIndex === 0) return null; // Header-Zeile

    const dataRow = v.rows[rowIndex - 1];
    if (!dataRow) {
      if (isStatusColumn && rowIndex === 1) {
        console.log(`[getCellValue] ❌ No data row for file ${fileId}, rowIndex ${rowIndex - 1}`);
      }
      return null;
    }

    if (!fieldName) {
      return null;
    }

    const cells = dataRow.cells;
    if (!cells) {
      if (rowIndex === 1 && colIndex === 14) {
        console.log(`[getCellValue] ❌ No cells for file ${fileId}, rowIndex ${rowIndex - 1}`);
      }
      return null;
    }

    // ✅ ERWEITERT: Debug für Status-Spalte für ALLE Zeilen
    const fieldNameLower = fieldName.toLowerCase();
    if (fieldNameLower.includes("status")) {
      console.log(`[getCellValue] Status-Spalte gefunden! File ${fileId}, Row ${rowIndex}, Field: "${fieldName}"`);
      console.log(`[getCellValue] Available cell keys:`, Object.keys(cells));
      console.log(`[getCellValue] Looking for: "Status in der uppr Performance Platform"`);
      console.log(`[getCellValue] Status cell exists:`, "Status in der uppr Performance Platform" in cells);
      if ("Status in der uppr Performance Platform" in cells) {
        const statusCell = cells["Status in der uppr Performance Platform"];
        console.log(`[getCellValue] Status cell:`, statusCell);
        console.log(`[getCellValue] Status cell type:`, typeof statusCell);
        console.log(`[getCellValue] Status cell has 'value':`, "value" in (statusCell || {}));
        if (statusCell && typeof statusCell === "object" && "value" in statusCell) {
          console.log(`[getCellValue] ✅ Status value found: "${statusCell.value}"`);
          return statusCell.value;
        } else {
          console.log(`[getCellValue] ❌ Status cell invalid:`, statusCell);
        }
      } else {
        console.log(`[getCellValue] ❌ Status cell not found in cells`);
      }
    }

    // Prüfe zuerst den exakten Feldnamen
    const byName = cells[fieldName];
    if (byName && typeof byName === "object" && "value" in byName) {
      return byName.value;
    }

    return null;
  };

  // ✅ holt den Status einer Zelle aus validate-Response
  const getCellStatus = (
    fileId: number,
    rowIndex: number,
    colIndex: number
  ): "ok" | "invalid" | "empty" | null => {
    const v = validationData[fileId];
    if (!v?.rows) return null;
    if (rowIndex === 0) return null;

    const dataRow = v.rows[rowIndex - 1];
    if (!dataRow) return null;

    const headerRow = fileData[fileId]?.[0];
    const fieldName = headerRow?.[colIndex];
    if (!fieldName) return null;

    const cells = dataRow.cells;
    if (!cells) return null;

    // Prüfe zuerst den exakten Feldnamen
    const byName = cells[fieldName];
    if (byName && typeof byName === "object" && "status" in byName) {
      return byName.status;
    }

    // Für Ordertoken-Spalten: Prüfe auch alternative Spaltennamen
    if (fieldName.toLowerCase().includes("order")) {
      // Prüfe alternative Spaltennamen
      const altNames = [
        "Ordertoken/OrderID",
        "Ordertoken/Order ID",
        "Ordertoken/OrderID ",
        "Ordertoken/Order ID ",
      ];
      
      for (const altName of altNames) {
        if (altName !== fieldName) {
          const altCell = cells[altName];
          if (altCell && typeof altCell === "object" && "status" in altCell) {
            return altCell.status;
          }
        }
      }
    }

    const byIndex = cells[colIndex];
    if (byIndex && typeof byIndex === "object" && "status" in byIndex) {
      return byIndex.status;
    }

    const nameStatus = cells[`${fieldName}_status`];
    if (typeof nameStatus === "string") {
      return nameStatus as any;
    }

    return null;
  };

  // ✅ holt den Status für eine gesamte Zeile aus validate-Response
  const getRowStatus = (
    fileId: number,
    rowIndex: number
  ): "offen" | "bestätigt" | "storniert" | "ausgezahlt" | null => {
    const v = validationData[fileId];
    if (!v?.rows) return null;
    if (rowIndex === 0) return null; // Header-Zeile

    const dataRow = v.rows[rowIndex - 1];
    if (!dataRow?.cells) return null;

    const statusCell = dataRow.cells["Status in der uppr Performance Platform"];
    if (statusCell && typeof statusCell === "object" && "value" in statusCell) {
      const statusValue = statusCell.value;
      // Status-Werte: 0 - offen, 1 - bestätigt, 2 - storniert, 3 - ausgezahlt
      if (statusValue === "offen" || statusValue === "0") return "offen";
      if (statusValue === "bestätigt" || statusValue === "1") return "bestätigt";
      if (statusValue === "storniert" || statusValue === "2") return "storniert";
      if (statusValue === "ausgezahlt" || statusValue === "3") return "ausgezahlt";
    }

    return null;
  };

  // ✅ gibt die CSS-Klasse für eine Zeile basierend auf dem Status zurück
  const getRowStatusClass = (status: "offen" | "bestätigt" | "storniert" | "ausgezahlt" | null): string => {
    switch (status) {
      case "offen":
        return "bg-yellow-50 hover:bg-yellow-100"; // Gelb für offen
      case "bestätigt":
        return "bg-green-50 hover:bg-green-100"; // Hellgrün für bestätigt
      case "storniert":
        return "bg-red-50 hover:bg-red-100"; // Hellrot für storniert
      case "ausgezahlt":
        return "bg-green-500 hover:bg-green-600 text-white"; // Dunkelgrün für ausgezahlt
      default:
        return "hover:bg-gray-50"; // Standard
    }
  };

  const getCellClass = (status: string | null) => {
    // Zell-Markierungen entfernt, da Zeilen jetzt farblich markiert werden
    return "";
  };

  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du die Datei <b>{fileToDelete?.filename}</b> wirklich löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-6">Admin - Upload Verwaltung</h3>
        <p className="text-gray-600 mb-6">
          Prüfe und weise Uploads den entsprechenden Advertisern zu.
        </p>

        <div className="space-y-1">
          <div className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
            <div>Löschen</div>
            <div>Dateiname</div>
            <div>Upload Datum</div>
            <div>bearbeitet von</div>
            <div>Kunde</div>
            <div>Status</div>
            <div>Aktionen</div>
          </div>

          {(uploads ?? []).filter(file => file.status !== 'completed').map((file) => (
            <React.Fragment key={file.id}>
              <div className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center">
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(file)}
                    className="bg-red-100 hover:bg-red-500 transition-colors duration-200 rounded-full p-0 w-9 h-9 flex items-center justify-center group"
                  >
                    <LucideX size={22} className="text-red-600 group-hover:text-white transition-colors duration-200" />
                  </Button>
                </div>

                <div className="text-gray-800 font-medium truncate max-w-[350px] cursor-pointer" title={file.filename}>
                  {file.filename}
                </div>

                <div className="text-gray-600">
                  {new Date(file.upload_date).toLocaleDateString()}
                </div>

                <div className="text-gray-800">
                  {file.last_modified_by || file.uploaded_by}
                </div>

                <div>
                  {file.status === 'pending' ? (
                    <Select
                      value={tempAssignments[file.id]?.toString() || ""}
                      onValueChange={(value) => handleAdvertiserSelection(file.id, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Kunde wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {advertisers.map((advertiser) => (
                          <SelectItem key={advertiser.id} value={advertiser.id.toString()}>
                            {advertiser.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-gray-800">
                      {(() => {
                        const email = file.assigned_advertiser_email;
                        if (!email) return 'Unbekannt';
                        const user = allUsers.find(u => u.email === email);
                        return user?.company || 'Unbekannt';
                      })()}
                    </span>
                  )}
                </div>

                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}
                    title={getStatusText(file.status)}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(file.id, file.filename)}
                    className="p-1 h-8 w-8 hover:bg-gray-200"
                    title="Datei herunterladen"
                  >
                    <ArrowDown size={16} className="text-gray-600" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAdvertiserAssignment(file.id)}
                    className={`rounded-full p-0 w-9 h-9 flex items-center justify-center group transition-colors duration-200
                      ${file.status === 'assigned' ? 'bg-pink-500 text-white' : 'text-gray-500'}
                      disabled:text-gray-300
                      ${file.status === 'assigned' ? '' : 'hover:bg-pink-100 focus:bg-pink-200 active:bg-pink-200 hover:text-white focus:text-white active:text-white disabled:bg-transparent'}`}
                    disabled={file.status !== 'pending' || !tempAssignments[file.id]}
                    title={file.status === 'pending' && tempAssignments[file.id] ? "Datei zuweisen/versenden" : "Bitte zuerst einen Advertiser wählen"}
                  >
                    <ArrowRight size={20} className={`${file.status === 'assigned' ? 'text-white' : 'text-gray-500 group-hover:text-white group-focus:text-white group-active:text-white'} transition-colors duration-200`} />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReturnToPublisher(file.id)}
                    className="p-1 h-8 w-8 hover:bg-blue-200"
                    disabled={!((file.status === 'assigned' || file.status === 'feedback_submitted') && allUsers.find(u => u.email === file.last_modified_by)?.role === 'advertiser')}
                    title="Datei an Publisher zurückschicken"
                  >
                    <ArrowUp size={16} className="text-blue-600" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExpand(file.id)}
                    className="p-1 h-8 w-8 hover:bg-gray-200"
                    title="Datei bearbeiten"
                  >
                    <Edit size={16} className="text-gray-600" />
                  </Button>
                </div>
              </div>

              {expandedId === file.id && (
                <div className="bg-gray-50 rounded-lg p-6 mt-2 border border-gray-200">
                  {isLoadingFile[file.id] ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
                      <span className="ml-2 text-gray-600">Lade Datei...</span>
                    </div>
                  ) : fileData[file.id] && fileData[file.id].length > 0 ? (
                    <div className="mb-6">
                      <Label className="text-pink-600 font-medium mb-2 block text-xs">
                        {file.filename} ({fileData[file.id].length} Zeilen)
                      </Label>

                      {isValidating[file.id] && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[10px] text-gray-600 mb-1">
                            <span>Vergleiche mit Netzwerk-API…</span>
                            <span>{Math.round(validationProgress[file.id] || 0)}%</span>
                          </div>

                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        
                          <div className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-600 to-pink-600
                                        transition-all duration-500 ease-out animate-pulse"
                              style={{ width: `${validationProgress[file.id] || 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="overflow-auto max-h-[600px] border rounded-lg bg-white shadow-inner">
                        <table className="min-w-full border-collapse text-[10px]">
                          <tbody>
                            {fileData[file.id].filter(Array.isArray).map((row, rowIndex) => {
                              // Hole Status für die gesamte Zeile
                              const rowStatus = getRowStatus(file.id, rowIndex);
                              const rowStatusClass = getRowStatusClass(rowStatus);
                              
                              return (
                              <tr key={rowIndex} className={`border-b transition-colors ${rowStatusClass}`}>
                                <td className="border-r p-0.5 bg-gray-50 text-gray-500 text-[10px] font-medium text-center sticky left-0 z-10 w-8">
                                  {rowIndex + 1}
                                </td>

                                {row.map((cell, colIndex) => {
                                  const status = getCellStatus(file.id, rowIndex, colIndex);
                                  const cellClass = getCellClass(status);
                                  
                                  // Hole Wert aus Validierung, falls vorhanden (ABER NICHT für Status-Spalte)
                                  const headerRow = fileData[file.id]?.[0];
                                  const fieldName = headerRow?.[colIndex];
                                  const isStatusColumn = fieldName?.toLowerCase().includes("status");
                                  
                                  // Für Status-Spalte: Zeige den ursprünglichen Wert, nicht den validierten
                                  const validatedValue = isStatusColumn ? null : getCellValue(file.id, rowIndex, colIndex);
                                  const displayValue = validatedValue !== null ? validatedValue : (cell || "");

                                  return (
                                    <td key={colIndex} className={`border-r p-0 ${cellClass}`}>
                                      <Input
                                        value={displayValue}
                                        onChange={(e) => handleCellChange(file.id, rowIndex, colIndex, e.target.value)}
                                        className={`border-0 focus-visible:ring-1 h-6 text-[10px] px-1 py-0.5 w-[70px] leading-tight bg-transparent ${cellClass}`}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <p className="text-[10px] text-gray-500 mt-1">
                        💡 Scrollen Sie horizontal und vertikal, um alle Spalten zu sehen.
                      </p>
                    </div>
                  ) : (
                    <div className="mb-6 text-gray-500 text-[10px]">
                      <p>Datei ist leer oder konnte nicht geladen werden.</p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setExpandedId(null)}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100"
                      disabled={isSavingFile[file.id]}
                    >
                      Abbrechen
                    </Button>

                    <Button
                      onClick={() => handleSaveFile(file.id)}
                      className="bg-pink-600 hover:bg-pink-700 text-white"
                      disabled={isSavingFile[file.id] || (fileData[file.id] && !hasFileChanges(file.id))}
                    >
                      {isSavingFile[file.id] ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Speichern...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Speichern
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <Accordion type="single" collapsible className="mt-10">
        <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
          <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">
            Abgeschlossene Dateien
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1">
              {(uploads ?? []).filter(file => file.status === 'completed').length === 0 && (
                <div className="py-4 text-gray-500">Keine abgeschlossenen Dateien gefunden.</div>
              )}

              {(uploads ?? []).filter(file => file.status === 'completed').map((file) => (
                <div
                  key={file.id}
                  className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center"
                >
                  <div />
                  <div className="text-gray-800 font-medium truncate max-w-[350px]">{file.filename}</div>
                  <div className="text-gray-600">{new Date(file.upload_date).toLocaleDateString()}</div>
                  <div className="text-gray-800">{file.last_modified_by || file.uploaded_by}</div>
                  <div className="text-gray-800">
                    {(() => {
                      const email = file.assigned_advertiser_email;
                      if (!email) return 'Unbekannt';
                      const user = allUsers.find(u => u.email === email);
                      return user?.company || 'Unbekannt';
                    })()}
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(file.id, file.filename)}
                      className="p-1 h-8 w-8 hover:bg-gray-200"
                    >
                      <ArrowDown size={16} className="text-gray-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};

export default AdminFileList;