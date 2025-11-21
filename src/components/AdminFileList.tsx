import { useState, useCallback, useEffect } from "react";
import { ArrowDown, Send, ArrowUp, Check, X as LucideX, Edit, Save, Loader2 } from "lucide-react";
import { ArrowRight } from "lucide-react";
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
  AlertDialogTrigger,
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
  upload_date: string; // Assuming date comes as a string from backend
  file_size: number;
  content_type: string;
  uploaded_by: string;
  status: string; // e.g., 'pending', 'approved', 'rejected'
  advertiser_count?: number; // Assuming this might come from the backend query
  last_modified_by?: string; // Added for last modified by
  assigned_advertiser_email?: string; // Added for assigned advertiser email
}

interface Advertiser {
  id: number; // Assuming SERIAL PRIMARY KEY becomes number
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

// Define the props type for AdminFileList
interface AdminFileListProps {
  advertisers: Advertiser[];
  onGrantAccess: (uploadId: number, advertiserId: number, expiresAt: Date) => Promise<void>;
}

const AdminFileList = ({ advertisers, onGrantAccess }: AdminFileListProps) => {
  const { toast } = useToast();
  
  // Temporäre Auswahl für Dropdown-Werte
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

  // Funktion zum Neuladen der Uploads
  const reloadUploads = useCallback(() => {
    uploadService.getUploads().then(setUploads);
  }, []);

  // Lade Uploads initial und setze Polling für regelmäßiges Reload
  useEffect(() => {
    reloadUploads();
    const interval = setInterval(reloadUploads, 10000); // alle 10 Sekunden
    return () => clearInterval(interval);
  }, [reloadUploads]);

  useEffect(() => {
    api.get("/users").then(res => setAllUsers(res.data)).catch(() => setAllUsers([]));
  }, []);

  function getCompanyByEmail(email: string): string {
    const user = allUsers.find(u => u.email === email);
    return user?.company || email;
  }

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
      case 'assigned':
        return 'Zugewiesen';
      case 'feedback':
        return 'Feedback eingereicht';
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

      reloadUploads(); // <-- Upload-Liste neu laden

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

  // Handler für Rückgabe an Publisher
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
    
    // Lade Datei-Inhalt wenn noch nicht geladen
    if (!fileData[id]) {
      setIsLoadingFile(prev => ({ ...prev, [id]: true }));
      try {
        const result = await uploadService.getFileContent(id);
        // Sicherstellen, dass data ein Array ist und alle Zeilen Arrays sind
        const safeData = Array.isArray(result.data) 
          ? result.data.filter(row => row !== null && row !== undefined).map(row => 
              Array.isArray(row) ? row : []
            )
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
  };

  const handleCellChange = (fileId: number, rowIndex: number, colIndex: number, value: string) => {
    const currentData = fileData[fileId] || [];
    const newData = [...currentData];
    
    // Stelle sicher, dass die Zeile existiert und ein Array ist
    if (!newData[rowIndex] || !Array.isArray(newData[rowIndex])) {
      newData[rowIndex] = [];
    }
    
    // Stelle sicher, dass die Spalte existiert
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
          {/* Header */}
          <div className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
            <div>Löschen</div>
            <div>Dateiname</div>
            <div>Upload Datum</div>
            <div>bearbeitet von</div>
            <div>Kunde</div>
            <div>Status</div>
            <div>Aktionen</div>
          </div>
          {/* File rows */}
          {(uploads ?? []).filter(file => file.status !== 'completed').map((file) => (
            <React.Fragment key={file.id}>
            <div 
              className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center"
            >
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
                ) :
                  <span className="text-gray-800">
                    {(() => {
                      const email = file.assigned_advertiser_email;
                      if (!email) return 'Unbekannt';
                      const user = allUsers.find(u => u.email === email);
                      return user?.company || 'Unbekannt';
                    })()}
                  </span>
                }
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
                  title={((file.status === 'assigned' || file.status === 'feedback_submitted') && allUsers.find(u => u.email === file.last_modified_by)?.role === 'advertiser') ? "Datei an Publisher zurückschicken" : "Nur möglich, wenn die Datei vom Advertiser bearbeitet wurde und Status 'zugewiesen' oder 'Feedback eingereicht' ist"}
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
            {/* Expandable edit section */}
            {expandedId === file.id && (
              <div className="bg-gray-50 rounded-lg p-6 mt-2 border border-gray-200">
                {/* Datei-Inhalt Anzeige */}
                {isLoadingFile[file.id] ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
                    <span className="ml-2 text-gray-600">Lade Datei...</span>
                  </div>
                ) : fileData[file.id] && Array.isArray(fileData[file.id]) && fileData[file.id].length > 0 ? (
                  <div className="mb-6">
                    <Label className="text-pink-600 font-medium mb-2 block text-xs">
                      Datei-Inhalt bearbeiten ({fileData[file.id].length} Zeilen)
                    </Label>
                    <div className="overflow-auto max-h-[600px] border rounded-lg bg-white shadow-inner">
                      <div className="sticky top-0 bg-gray-100 z-10 border-b">
                        <table className="min-w-full border-collapse text-[10px]">
                          <thead>
                            <tr>
                              <th className="border-r border-b p-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold w-8 text-center sticky left-0 bg-gray-100 z-20">
                                #
                              </th>
                              {fileData[file.id][0] && Array.isArray(fileData[file.id][0]) ? 
                                fileData[file.id][0].map((_, colIndex) => {
                                  // Bestimme die Hintergrundfarbe basierend auf der Spalte
                                  let bgColor = "bg-gray-100"; // Standard: Grau
                                  let textColor = "text-gray-600";
                                  
                                  if (colIndex <= 10) {
                                    // A-K (Index 0-10): Blau
                                    bgColor = "bg-blue-500";
                                    textColor = "text-white";
                                  } else if (colIndex >= 11 && colIndex <= 14) {
                                    // L-O (Index 11-14): Magenta
                                    bgColor = "bg-[#e91e63]";
                                    textColor = "text-white";
                                  } else {
                                    // Rest (ab Index 15): Grau
                                    bgColor = "bg-gray-300";
                                    textColor = "text-gray-700";
                                  }
                                  
                                  return (
                                    <th 
                                      key={colIndex} 
                                      className={`border-r border-b p-0.5 ${bgColor} ${textColor} text-[10px] font-semibold w-[70px]`}
                                    >
                                      {String.fromCharCode(65 + (colIndex % 26))}
                                      {colIndex >= 26 ? Math.floor(colIndex / 26) : ''}
                                    </th>
                                  );
                                }) : null
                              }
                              <th className="border-r border-b p-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold w-8"></th>
                            </tr>
                          </thead>
                        </table>
                      </div>
                      <table className="min-w-full border-collapse text-[10px]">
                        <tbody>
                          {fileData[file.id].filter(row => row && Array.isArray(row)).map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b hover:bg-gray-50 transition-colors">
                              <td className="border-r p-0.5 bg-gray-50 text-gray-500 text-[10px] font-medium text-center sticky left-0 bg-gray-50 z-10 w-8">
                                {rowIndex + 1}
                              </td>
                              {row && Array.isArray(row) ? row.map((cell, colIndex) => (
                                <td key={colIndex} className="border-r p-0">
                                  <Input
                                    value={cell || ""}
                                    onChange={(e) => handleCellChange(file.id, rowIndex, colIndex, e.target.value)}
                                    className="border-0 focus-visible:ring-1 h-6 text-[10px] px-1 py-0.5 w-[70px] leading-tight"
                                    placeholder=""
                                  />
                                </td>
                              )) : null}
                              {/* Leere Zelle für neue Spalten */}
                              <td className="border-r p-0 w-8">
                                <Input
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value && row && Array.isArray(row)) {
                                      handleCellChange(file.id, rowIndex, row.length, e.target.value);
                                    }
                                  }}
                                  placeholder="+"
                                  className="border-0 focus-visible:ring-1 h-6 w-full text-[10px] px-1"
                                />
                              </td>
                            </tr>
                          ))}
                          {/* Neue Zeile hinzufügen */}
                          <tr className="bg-gray-50">
                            <td colSpan={(fileData[file.id] && fileData[file.id][0] && Array.isArray(fileData[file.id][0]) ? fileData[file.id][0].length : 0) + 2} className="p-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const currentData = fileData[file.id] || [];
                                  const colCount = currentData[0] && Array.isArray(currentData[0]) ? currentData[0].length : 1;
                                  const newRow = new Array(colCount).fill("");
                                  setFileData(prev => ({
                                    ...prev,
                                    [file.id]: [...(prev[file.id] || []), newRow]
                                  }));
                                }}
                                className="w-full text-[10px] h-6 px-2"
                              >
                                + Neue Zeile
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      💡 Scrollen Sie horizontal und vertikal, um alle Spalten zu sehen.
                    </p>
                  </div>
                ) : fileData[file.id] ? (
                  <div className="mb-6 text-gray-500 text-[10px]">
                    <p>Datei ist leer oder konnte nicht geladen werden.</p>
                  </div>
                ) : null}
                {/* Action Buttons */}
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
      {/* Accordion für abgeschlossene Dateien */}
      <Accordion type="single" collapsible className="mt-10">
        <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
          <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
          <AccordionContent>
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
              {(uploads ?? []).filter(file => file.status === 'completed').length === 0 && (
                <div className="py-4 text-gray-500">Keine abgeschlossenen Dateien gefunden.</div>
              )}
              {(uploads ?? []).filter(file => file.status === 'completed').map((file) => (
                <div
                  key={file.id}
                  className="grid grid-cols-[40px,3fr,2fr,2fr,2fr,1fr,2fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center"
                >
                  <div /> {/* Keine Löschaktion */}
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
                    {(() => {
                      const email = file.assigned_advertiser_email;
                      if (!email) return 'Unbekannt';
                      const user = allUsers.find(u => u.email === email);
                      return user?.company || 'Unbekannt';
                    })()}
                  </div>
                  <div className="flex items-center">
                    <div
                      className={`w-3 h-3 rounded-full bg-green-500`}
                      title="Abgeschlossen"
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
