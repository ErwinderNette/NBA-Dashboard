import { useState, useEffect, useRef } from "react";
import { ArrowDown, Edit, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadService } from '@/services/uploadService';
import { UploadItem } from '@/types/upload';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import api from '@/services/api';

interface AdvertiserFileListProps {
  uploads?: UploadItem[];
}

const AdvertiserFileList = ({ uploads: uploadsProp }: AdvertiserFileListProps) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<number, {
    feedback: string;
    status: string;
    additionalFeedback: string;
  }>>({});
  const [uploads, setUploads] = useState<UploadItem[]>(uploadsProp || []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
  const [isUploading, setIsUploading] = useState<Record<number, boolean>>({});
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState<Record<number, boolean>>({});
  const [pendingUploadId, setPendingUploadId] = useState<number | null>(null);
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<{email: string, company: string}[]>([]);
  const [fileData, setFileData] = useState<Record<number, string[][]>>({});
  const [originalFileData, setOriginalFileData] = useState<Record<number, string[][]>>({});
  const [isLoadingFile, setIsLoadingFile] = useState<Record<number, boolean>>({});
  const [isSavingFile, setIsSavingFile] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (uploadsProp) {
      setUploads(uploadsProp);
      setIsLoading(false);
      return;
    }
    const fetchUploads = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const allUploads = await uploadService.getUploads();
        setUploads(allUploads); // KEIN Filter mehr!
      } catch (err) {
        setError('Fehler beim Laden der Uploads.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUploads();
  }, [uploadsProp]);

  useEffect(() => {
    api.get('/users').then(res => setAllUsers(res.data)).catch(() => setAllUsers([]));
  }, []);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'NBA eingegangen';
      case 'feedback':
        return 'Feedback eingereicht';
      case 'feedback_submitted':
        return 'Feedback eingereicht';
      case 'returned_to_publisher':
        return 'Publisher eingegangen';
      case 'completed':
        return 'Abgeschlossen';
      case 'nba_received':
        return 'NBA eingegangen';
      case 'pending':
        return 'offen';
      case 'approved':
        return 'ausgeführt';
      case 'rejected':
        return 'abgelehnt';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'bg-pink-600'; // magenta
      case 'feedback':
        return 'bg-yellow-400'; // gelb
      case 'returned_to_publisher':
        return 'bg-sky-300'; // hellblau
      case 'completed':
        return 'bg-green-500'; // grün
      case 'nba_received':
        return 'bg-gray-400';
      case 'feedback_submitted':
        return 'bg-blue-500';
      case 'approved':
      case 'granted':
        return 'bg-pink-500';
      case 'pending':
        return 'bg-gray-400';
      case 'rejected':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
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
    
    // Initialisiere Feedback-Daten falls noch nicht vorhanden
    if (!editData[id]) {
      setEditData(prev => ({
        ...prev,
        [id]: {
          feedback: '',
          status: 'pending',
          additionalFeedback: ''
        }
      }));
    }
  };

  const handleInputChange = (id: number, field: string, value: string) => {
    setEditData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSave = async (id: number) => {
    // Speichere Datei-Daten wenn vorhanden
    if (fileData[id]) {
      setIsSavingFile(prev => ({ ...prev, [id]: true }));
      try {
        await uploadService.saveFileContent(id, fileData[id]);
        setOriginalFileData(prev => ({ ...prev, [id]: JSON.parse(JSON.stringify(fileData[id])) }));
        toast({
          title: "Erfolg",
          description: "Datei wurde erfolgreich gespeichert.",
        });
        // Lade Uploads neu
        const allUploads = await uploadService.getUploads();
        setUploads(allUploads);
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
    
    // Speichere Feedback-Daten (falls später implementiert)
    console.log(`Saving feedback for file ${id}:`, editData[id]);
    setExpandedId(null);
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

  const hasFileChanges = (fileId: number): boolean => {
    if (!fileData[fileId] || !originalFileData[fileId]) return false;
    return JSON.stringify(fileData[fileId]) !== JSON.stringify(originalFileData[fileId]);
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      await uploadService.downloadFile(id, filename);
      // Optional: Toast anzeigen
    } catch (err) {
      // Optional: Toast für Fehler
    }
  };

  // Handler für Datei-Auswahl
  const handleFileChange = (uploadId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setSelectedFiles(prev => ({ ...prev, [uploadId]: file }));
  };

  // Handler für Datei ersetzen
  const handleReplaceFile = async (uploadId: number) => {
    const file = selectedFiles[uploadId];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(prev => ({ ...prev, [uploadId]: true }));
    try {
      await uploadService.replaceFile(uploadId, formData);
      toast({ title: 'Datei ersetzt', description: 'Die Datei wurde erfolgreich ersetzt.' });
      setSelectedFiles(prev => ({ ...prev, [uploadId]: null }));
      if (fileInputs.current[uploadId]) fileInputs.current[uploadId]!.value = '';
      window.location.reload();
    } catch (err) {
      toast({ title: 'Fehler', description: 'Die Datei konnte nicht ersetzt werden.', variant: 'destructive' });
    } finally {
      setIsUploading(prev => ({ ...prev, [uploadId]: false }));
    }
  };

  if (isLoading) {
    return <div>Lade Dateien...</div>;
  }
  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktuelle Uploads</h3>
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-4">Dateiname</div>
          <div className="col-span-2">Upload Datum</div>
          <div className="col-span-3">Publisher</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Upload</div>
          <div className="col-span-1">Download</div>
        </div>
        {/* File rows */}
        {(uploads ?? []).length === 0 && <div className="py-4 text-gray-500">Keine Dateien gefunden.</div>}
        {(uploads ?? []).map((file) => (
          <div key={file.id}>
            <div className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center">
              <div
                className="col-span-4 text-gray-800 font-medium truncate max-w-[350px] cursor-pointer"
                title={file.filename}
              >
                {file.filename}
              </div>
              <div className="col-span-2 text-gray-600">
                {file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : ''}
              </div>
              <div className="col-span-3 text-gray-800">
                {(() => {
                  const user = allUsers.find(u => u.email === file.uploaded_by);
                  return user?.company || file.uploaded_by;
                })()}
              </div>
              <div className="col-span-2 flex items-center">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}></div>
                <span className="ml-2 text-sm">{getStatusLabel(file.status)}</span>
              </div>
              {/* Upload/Ersetzen */}
              <div className="col-span-1 flex flex-col items-start space-y-1">
                <input
                  type="file"
                  style={{ display: 'none' }}
                  ref={el => fileInputs.current[file.id] = el}
                  onChange={e => handleFileChange(file.id, e)}
                  accept=".csv,.xls,.xlsx,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                />
                <div className="rounded-xl shadow border border-gray-100 bg-white px-2 py-1 flex flex-col items-center gap-1 w-full max-w-[320px] mx-auto">
                  {selectedFiles[file.id] ? (
                    <div className="flex flex-col items-center w-full">
                      <div className="flex flex-row items-center justify-center w-full">
                        <button
                          className="flex-shrink-0 flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs transition disabled:opacity-50"
                          onClick={() => { setPendingUploadId(file.id); setUploadConfirmOpen(prev => ({ ...prev, [file.id]: true })); }}
                          type="button"
                          disabled={isUploading[file.id]}
                          style={{ minWidth: '90px' }}
                        >
                          {isUploading[file.id] ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" /></svg>
                          )}
                          Hochladen
                        </button>
                        <AlertDialog open={!!uploadConfirmOpen[file.id]} onOpenChange={open => setUploadConfirmOpen(prev => ({ ...prev, [file.id]: open }))}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Upload bestätigen</AlertDialogTitle>
                              <AlertDialogDescription>
                                Bist du sicher, dass du diese Datei hochladen und an den Publisher & uppr zurückschicken möchtest?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setUploadConfirmOpen(prev => ({ ...prev, [file.id]: false }))}>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => { setUploadConfirmOpen(prev => ({ ...prev, [file.id]: false })); handleReplaceFile(file.id); }}>Hochladen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <button
                          className="flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full p-1 ml-2 mr-2"
                          onClick={() => { setSelectedFiles(prev => ({ ...prev, [file.id]: null })); if (fileInputs.current[file.id]) fileInputs.current[file.id]!.value = ''; }}
                          type="button"
                          title="Auswahl entfernen"
                          style={{ width: '28px', height: '28px' }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <span
                        className="mt-2 flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-700 w-full justify-center text-center max-w-[300px] truncate"
                        title={selectedFiles[file.id]?.name}
                        style={{ minWidth: 0 }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4z" /></svg>
                        {selectedFiles[file.id]?.name}
                      </span>
                    </div>
                  ) : (
                    <button
                      className={`flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-sm transition${file.status === 'returned_to_publisher' ? ' opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => fileInputs.current[file.id]?.click()}
                      type="button"
                      disabled={isUploading[file.id] || file.status === 'returned_to_publisher'}
                      title={file.status === 'returned_to_publisher' ? 'Datei kann nicht mehr ersetzt werden' : undefined}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" /></svg>
                      Ersetzen
                    </button>
                  )}
                  {isUploading[file.id] && (
                    <div className="w-full mt-1">
                      <div className="h-1 bg-blue-200 rounded">
                        <div className="h-1 bg-blue-500 rounded animate-pulse" style={{ width: '100%' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Download */}
              <div className="col-span-1 flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExpand(file.id)}
                  className="p-1 h-8 w-8 hover:bg-gray-200"
                >
                  <Edit size={16} className="text-gray-600" />
                </Button>
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Feedback Input */}
                  <div className="space-y-2">
                    <Label className="text-pink-600 font-medium">Feedback</Label>
                    <Input
                      value={editData[file.id]?.feedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'feedback', e.target.value)}
                      placeholder="Feedback eingeben..."
                      className="bg-white border-gray-300"
                    />
                  </div>
                  {/* Status Dropdown */}
                  <div className="space-y-2">
                    <Label className="text-pink-600 font-medium">Status in der uppr Performance Platform</Label>
                    <Select
                      value={editData[file.id]?.status || 'pending'}
                      onValueChange={(value) => handleInputChange(file.id, 'status', value)}
                    >
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue placeholder="Status auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">offen</SelectItem>
                        <SelectItem value="approved">ausgeführt</SelectItem>
                        <SelectItem value="rejected">abgelehnt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Additional Feedback */}
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-pink-600 font-medium">Sonstiges Feedback</Label>
                    <Textarea
                      value={editData[file.id]?.additionalFeedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'additionalFeedback', e.target.value)}
                      placeholder="Zusätzliches Feedback eingeben..."
                      rows={3}
                      className="bg-white border-gray-300"
                    />
                  </div>
                </div>
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
                    onClick={() => handleSave(file.id)}
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdvertiserFileList;
