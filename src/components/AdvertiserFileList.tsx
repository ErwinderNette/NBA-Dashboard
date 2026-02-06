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
import { validationStorage } from '@/utils/validationStorage';

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
  // ✅ Validierungsergebnisse für Zeilenfärbung
  const [validationData, setValidationData] = useState<Record<number, any>>({});
  // ✅ Excel-ähnliche Copy-Paste Funktionalität
  const [selectedCells, setSelectedCells] = useState<Record<number, Set<string>>>({}); // fileId -> Set of "row-col"
  const [copiedCells, setCopiedCells] = useState<Record<number, { data: string[][], startRow: number, startCol: number }>>({});
  const [isSelecting, setIsSelecting] = useState<Record<number, { startRow: number, startCol: number } | null>>({});

  useEffect(() => {
    // ✅ Lade zuerst Validierungen aus localStorage (sofort verfügbar, auch nach Reload)
    const storedValidations = validationStorage.loadAll();
    if (Object.keys(storedValidations).length > 0) {
      console.log(`[AdvertiserFileList] Geladene Validierungen aus localStorage:`, Object.keys(storedValidations).length);
      setValidationData(storedValidations);
    }
    
    // ✅ Lade auch aus der DB (als Backup/Sync)
    const loadAllValidations = async () => {
      try {
        const validations = await uploadService.getAllValidations();
        const convertedValidations: Record<number, any> = {};
        for (const [key, value] of Object.entries(validations)) {
          const uploadId = parseInt(key, 10);
          if (!isNaN(uploadId)) {
            convertedValidations[uploadId] = value;
            // ✅ Speichere auch in localStorage (als Backup/Sync)
            validationStorage.save(uploadId, value);
          }
        }
        setValidationData(prev => ({ ...prev, ...convertedValidations }));
        console.log(`[AdvertiserFileList] Geladene Validierungen aus DB:`, Object.keys(convertedValidations).length);
      } catch (err) {
        console.error("[AdvertiserFileList] Fehler beim Laden der Validierungen:", err);
      }
    };
    loadAllValidations();
    
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
        // Sortiere nach upload_date (neueste zuerst)
        const sortedUploads = [...allUploads].sort((a, b) => {
          const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
          const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
          return dateB - dateA; // Absteigend (neueste zuerst)
        });
        setUploads(sortedUploads); // KEIN Filter mehr!
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
        setFileData(prev => ({ ...prev, [id]: result.data }));
        setOriginalFileData(prev => ({ ...prev, [id]: JSON.parse(JSON.stringify(result.data)) }));
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
    
    // ✅ Lade Validierungsergebnisse (falls vorhanden) - zuerst localStorage, dann DB
    if (!validationData[id]) {
      // Versuche zuerst localStorage
      const stored = validationStorage.load(id);
      if (stored) {
        console.log(`[AdvertiserFileList] Gespeicherte Validierung aus localStorage geladen für file ${id}`);
        setValidationData(prev => ({ ...prev, [id]: stored }));
      } else {
        // Falls nicht in localStorage, versuche DB
        try {
          const validation = await uploadService.getValidation(id);
          if (validation) {
            console.log(`[AdvertiserFileList] Gespeicherte Validierung aus DB geladen für file ${id}`);
            setValidationData(prev => ({ ...prev, [id]: validation }));
            // Speichere auch in localStorage für nächstes Mal
            validationStorage.save(id, validation);
          }
        } catch (err) {
          // Keine Validierung vorhanden - das ist OK
          console.log(`[AdvertiserFileList] Keine Validierung für file ${id}`);
        }
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
        // Sortiere nach upload_date (neueste zuerst)
        const sortedUploads = [...allUploads].sort((a, b) => {
          const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
          const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
          return dateB - dateA; // Absteigend (neueste zuerst)
        });
        setUploads(sortedUploads);
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
    const newData = [...(fileData[fileId] || [])];
    if (!newData[rowIndex]) {
      newData[rowIndex] = [];
    }
    // Stelle sicher, dass die Zeile genug Spalten hat
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

  // ✅ Gibt die CSS-Klasse für eine Zeile basierend auf dem Status zurück
  const getRowStatusClass = (status: "offen" | "bestätigt" | "storniert" | "ausgezahlt" | null): string => {
    switch (status) {
      case "offen":
        return "bg-yellow-50 hover:bg-yellow-100"; // Gelb für offen
      case "bestätigt":
        return "bg-green-50 hover:bg-green-100"; // Hellgrün für bestätigt
      case "storniert":
        return "bg-red-50 hover:bg-red-100"; // Hellrot für storniert
      case "ausgezahlt":
        return "bg-green-500 hover:bg-green-600 text-black"; // Dunkelgrün für ausgezahlt mit schwarzer Schrift
      default:
        return "hover:bg-gray-50"; // Standard
    }
  };

  // ✅ Prüft, ob eine Spalte bearbeitbar ist (ab der zweiten "Ordertoken/OrderID" Spalte)
  const isColumnEditable = (fileId: number, colIndex: number, rowIndex?: number): boolean => {
    const headerRow = fileData[fileId]?.[0];
    if (!headerRow) return false;

    // Header-Zeile (rowIndex === 0) ist nie bearbeitbar
    if (rowIndex === 0) {
      return false;
    }

    // Prüfe, ob die Zeile "ausgezahlt" Status hat - dann ist sie nicht bearbeitbar
    if (rowIndex !== undefined && rowIndex > 0) {
      const rowStatus = getRowStatus(fileId, rowIndex);
      if (rowStatus === "ausgezahlt") {
        return false; // Ausgezahlte Zeilen sind komplett nicht bearbeitbar
      }
    }

    // Finde alle "Ordertoken/OrderID" Spalten
    const orderTokenColumns: number[] = [];
    headerRow.forEach((header, idx) => {
      const headerLower = (header || "").toLowerCase();
      if (headerLower.includes("ordertoken") && headerLower.includes("order")) {
        orderTokenColumns.push(idx);
      }
    });

    // Wenn es mindestens 2 "Ordertoken/OrderID" Spalten gibt, ist ab der zweiten bearbeitbar
    if (orderTokenColumns.length >= 2) {
      const secondOrderTokenIndex = orderTokenColumns[1];
      return colIndex >= secondOrderTokenIndex;
    }

    // Fallback: Wenn keine oder nur eine gefunden wurde, alles bearbeitbar lassen
    return true;
  };

  // ✅ Excel-ähnliche Copy-Paste Handler
  const handleCellMouseDown = (fileId: number, rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (e.shiftKey && isSelecting[fileId]) {
      // Shift+Klick: Erweitere Selection
      const start = isSelecting[fileId]!;
      const newSelection = new Set<string>();
      const minRow = Math.min(start.startRow, rowIndex);
      const maxRow = Math.max(start.startRow, rowIndex);
      const minCol = Math.min(start.startCol, colIndex);
      const maxCol = Math.max(start.startCol, colIndex);
      
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          newSelection.add(`${r}-${c}`);
        }
      }
      setSelectedCells(prev => ({ ...prev, [fileId]: newSelection }));
    } else {
      // Neuer Selection Start
      setIsSelecting(prev => ({ ...prev, [fileId]: { startRow: rowIndex, startCol: colIndex } }));
      setSelectedCells(prev => ({ ...prev, [fileId]: new Set([`${rowIndex}-${colIndex}`]) }));
    }
  };

  const handleCellMouseEnter = (fileId: number, rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (e.buttons === 1 && isSelecting[fileId]) {
      // Drag Selection
      const start = isSelecting[fileId]!;
      const newSelection = new Set<string>();
      const minRow = Math.min(start.startRow, rowIndex);
      const maxRow = Math.max(start.startRow, rowIndex);
      const minCol = Math.min(start.startCol, colIndex);
      const maxCol = Math.max(start.startCol, colIndex);
      
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          newSelection.add(`${r}-${c}`);
        }
      }
      setSelectedCells(prev => ({ ...prev, [fileId]: newSelection }));
    }
  };

  const handleCopy = (fileId: number, e: React.ClipboardEvent | KeyboardEvent) => {
    const selection = selectedCells[fileId];
    if (!selection || selection.size === 0) return;

    e.preventDefault();
    
    // Finde die Bounds der Selection
    const cells = Array.from(selection).map(key => {
      const [r, c] = key.split('-').map(Number);
      return { row: r, col: c };
    });
    
    const minRow = Math.min(...cells.map(c => c.row));
    const maxRow = Math.max(...cells.map(c => c.row));
    const minCol = Math.min(...cells.map(c => c.col));
    const maxCol = Math.max(...cells.map(c => c.col));
    
    // Erstelle 2D Array der kopierten Daten
    const copiedData: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const cellKey = `${r}-${c}`;
        if (selection.has(cellKey)) {
          const cellValue = fileData[fileId]?.[r]?.[c] || "";
          row.push(cellValue);
        } else {
          row.push("");
        }
      }
      copiedData.push(row);
    }
    
    // Kopiere als Tab-separierten Text (Excel-Format)
    const textData = copiedData.map(row => row.join('\t')).join('\n');
    
    if (e instanceof ClipboardEvent) {
      e.clipboardData.setData('text/plain', textData);
    } else {
      navigator.clipboard.writeText(textData);
    }
    
    // Speichere für Paste
    setCopiedCells(prev => ({
      ...prev,
      [fileId]: {
        data: copiedData,
        startRow: minRow,
        startCol: minCol
      }
    }));
    
    toast({
      title: "Kopiert",
      description: `${copiedData.length} Zeile(n) kopiert`,
    });
  };

  const handlePaste = (fileId: number, startRow: number, startCol: number, e: React.ClipboardEvent | null, pastedData?: string[][]) => {
    const dataToPaste = pastedData || copiedCells[fileId]?.data;
    if (!dataToPaste || dataToPaste.length === 0) {
      // Versuche aus Clipboard zu lesen
      if (e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const rows = text.split('\n').map(row => row.split('\t'));
        if (rows.length > 0 && rows[0].length > 0) {
          handlePasteData(fileId, startRow, startCol, rows);
          return;
        }
      }
      return;
    }
    
    if (e) e.preventDefault();
    handlePasteData(fileId, startRow, startCol, dataToPaste);
  };

  const handlePasteData = (fileId: number, startRow: number, startCol: number, data: string[][]) => {
    const newData = [...(fileData[fileId] || [])];
    
    data.forEach((row, rowOffset) => {
      const targetRow = startRow + rowOffset;
      if (!newData[targetRow]) {
        newData[targetRow] = [];
      }
      
      row.forEach((cell, colOffset) => {
        const targetCol = startCol + colOffset;
        // Prüfe ob Spalte bearbeitbar ist (inkl. Zeilenstatus)
        if (isColumnEditable(fileId, targetCol, targetRow)) {
          while (newData[targetRow].length <= targetCol) {
            newData[targetRow].push("");
          }
          newData[targetRow][targetCol] = cell;
        }
      });
    });
    
    setFileData(prev => ({ ...prev, [fileId]: newData }));
    
    toast({
      title: "Eingefügt",
      description: `${data.length} Zeile(n) eingefügt`,
    });
  };

  // ✅ Keyboard Handler für Copy-Paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (expandedId === null) return;
      
      // Nur wenn ein Input-Feld fokussiert ist
      const activeElement = document.activeElement;
      if (!activeElement || activeElement.tagName !== 'INPUT') return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy(expandedId, e);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Paste wird über onPaste Handler behandelt, aber wir können hier auch unterstützen
        // Der onPaste Handler auf dem Input wird automatisch aufgerufen
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedId, selectedCells, fileData, copiedCells]);

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
              <div className="bg-gray-50 rounded-lg p-8 mt-2 border border-gray-200">
                {/* Datei-Inhalt Anzeige */}
                {isLoadingFile[file.id] ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
                    <span className="ml-2 text-gray-600">Lade Datei...</span>
                  </div>
                ) : fileData[file.id] && fileData[file.id].length > 0 ? (
                  <div className="mb-6">
                    <Label className="text-pink-600 font-medium mb-3 block text-sm">
                      {file.filename} ({fileData[file.id].length} Zeilen)
                    </Label>

                    <div className="overflow-auto max-h-[800px] border rounded-lg bg-white shadow-inner">
                      <table className="min-w-full border-collapse text-sm">
                        <tbody>
                          {(() => {
                            // Berechne die maximale Anzahl von Spalten über alle Zeilen
                            const maxCols = Math.max(
                              ...fileData[file.id].filter(Array.isArray).map(row => row.length),
                              1
                            );
                            
                            return fileData[file.id].filter(Array.isArray).map((row, rowIndex) => {
                              // Hole Status für die gesamte Zeile aus Validierungsergebnissen
                              const rowStatus = getRowStatus(file.id, rowIndex);
                              const rowStatusClass = getRowStatusClass(rowStatus);
                              const isHeaderRow = rowIndex === 0;
                              
                              // Stelle sicher, dass die Zeile die maximale Anzahl von Spalten hat
                              const paddedRow = [...row];
                              while (paddedRow.length < maxCols) {
                                paddedRow.push("");
                              }
                              
                              return (
                                <tr key={rowIndex} className={`border-b transition-colors ${isHeaderRow ? 'bg-blue-50' : rowStatusClass}`}>
                                  <td className={`border-r p-2 text-sm font-semibold text-center sticky left-0 z-10 min-w-[50px] ${isHeaderRow ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-600'}`}>
                                    {rowIndex + 1}
                                  </td>

                                  {paddedRow.map((cell, colIndex) => {
                                    const editable = isColumnEditable(file.id, colIndex, rowIndex);
                                    const cellKey = `${rowIndex}-${colIndex}`;
                                    const isSelected = selectedCells[file.id]?.has(cellKey) || false;
                                    return (
                                      <td 
                                        key={colIndex} 
                                        className="border-r p-1 border-gray-200"
                                        onMouseDown={(e) => handleCellMouseDown(file.id, rowIndex, colIndex, e)}
                                        onMouseEnter={(e) => handleCellMouseEnter(file.id, rowIndex, colIndex, e)}
                                      >
                                        <Input
                                          value={cell || ""}
                                          onChange={(e) => handleCellChange(file.id, rowIndex, colIndex, e.target.value)}
                                          readOnly={!editable}
                                          onCopy={(e) => {
                                            // Wenn keine Selection vorhanden ist, selektiere diese Zelle
                                            if (!selectedCells[file.id] || selectedCells[file.id].size === 0 || !isSelected) {
                                              setSelectedCells(prev => ({ 
                                                ...prev, 
                                                [file.id]: new Set([cellKey]) 
                                              }));
                                            }
                                            // Kopiere die Selection
                                            setTimeout(() => handleCopy(file.id, e), 0);
                                          }}
                                          onPaste={(e) => {
                                            if (editable) {
                                              handlePaste(file.id, rowIndex, colIndex, e);
                                            }
                                          }}
                                          onFocus={() => {
                                            // Bei Focus diese Zelle selektieren
                                            setSelectedCells(prev => ({ 
                                              ...prev, 
                                              [file.id]: new Set([cellKey]) 
                                            }));
                                            setIsSelecting(prev => ({ 
                                              ...prev, 
                                              [file.id]: { startRow: rowIndex, startCol: colIndex } 
                                            }));
                                          }}
                                          onClick={(e) => {
                                            // Bei Klick diese Zelle selektieren (für Copy)
                                            if (e.shiftKey) {
                                              handleCellMouseDown(file.id, rowIndex, colIndex, e as any);
                                            } else {
                                              setSelectedCells(prev => ({ 
                                                ...prev, 
                                                [file.id]: new Set([cellKey]) 
                                              }));
                                              setIsSelecting(prev => ({ 
                                                ...prev, 
                                                [file.id]: { startRow: rowIndex, startCol: colIndex } 
                                              }));
                                            }
                                          }}
                                          className={`border border-gray-200 h-10 text-sm px-2 py-1 min-w-[140px] leading-normal ${
                                            isSelected 
                                              ? 'ring-2 ring-pink-500 ring-offset-1'
                                              : ''
                                          } ${
                                            isHeaderRow 
                                              ? editable
                                                ? 'bg-blue-50 font-semibold hover:bg-blue-100'
                                                : 'bg-blue-100 font-semibold text-gray-600 cursor-text'
                                              : editable
                                                ? 'bg-white hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-pink-500'
                                                : 'bg-gray-100 text-gray-600 cursor-text'
                                          }`}
                                          placeholder=""
                                        />
                                      </td>
                                    );
                                  })}
                                  {/* Zelle für neue Spalten */}
                                  <td className="border-r p-1 border-gray-200">
                                    <Input
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          handleCellChange(file.id, rowIndex, maxCols, e.target.value);
                                        }
                                      }}
                                      placeholder="+"
                                      className="border border-gray-200 focus-visible:ring-2 focus-visible:ring-pink-500 h-10 w-20 text-sm bg-gray-50 hover:bg-gray-100"
                                    />
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                          {/* Neue Zeile hinzufügen */}
                          <tr>
                            <td colSpan={(() => {
                              const maxCols = Math.max(
                                ...fileData[file.id].filter(Array.isArray).map(row => row.length),
                                1
                              );
                              return maxCols + 2; // +1 für Zeilennummer, +1 für "+" Spalte
                            })()} className="p-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const maxCols = Math.max(
                                    ...fileData[file.id].filter(Array.isArray).map(row => row.length),
                                    1
                                  );
                                  const newRow = new Array(maxCols).fill("");
                                  setFileData(prev => ({
                                    ...prev,
                                    [file.id]: [...(prev[file.id] || []), newRow]
                                  }));
                                }}
                                className="w-full text-sm py-2"
                              >
                                + Neue Zeile
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <p className="text-sm text-gray-500 mt-2">
                      💡 Scrollen Sie horizontal und vertikal, um alle Spalten zu sehen.
                    </p>
                  </div>
                ) : (
                  <div className="mb-6 text-gray-500 text-sm">
                    <p>Datei ist leer oder konnte nicht geladen werden.</p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {/* Feedback Input */}
                  <div className="space-y-3">
                    <Label className="text-pink-600 font-semibold text-base">Feedback</Label>
                    <Input
                      value={editData[file.id]?.feedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'feedback', e.target.value)}
                      placeholder="Feedback eingeben..."
                      className="bg-white border-gray-300 h-11 text-base"
                    />
                  </div>
                  {/* Status Dropdown */}
                  <div className="space-y-3">
                    <Label className="text-pink-600 font-semibold text-base">Status in der uppr Performance Platform</Label>
                    <Select
                      value={editData[file.id]?.status || 'pending'}
                      onValueChange={(value) => handleInputChange(file.id, 'status', value)}
                    >
                      <SelectTrigger className="bg-white border-gray-300 h-11 text-base">
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
                  <div className="space-y-3 md:col-span-2">
                    <Label className="text-pink-600 font-semibold text-base">Sonstiges Feedback</Label>
                    <Textarea
                      value={editData[file.id]?.additionalFeedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'additionalFeedback', e.target.value)}
                      placeholder="Zusätzliches Feedback eingeben..."
                      rows={4}
                      className="bg-white border-gray-300 text-base min-h-[100px]"
                    />
                  </div>
                </div>
                {/* Action Buttons */}
                <div className="flex justify-end space-x-4 mt-8">
                  <Button
                    variant="outline"
                    onClick={() => setExpandedId(null)}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100 h-11 px-6 text-base"
                    disabled={isSavingFile[file.id]}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={() => handleSave(file.id)}
                    className="bg-pink-600 hover:bg-pink-700 text-white h-11 px-6 text-base"
                    disabled={isSavingFile[file.id] || (fileData[file.id] && !hasFileChanges(file.id))}
                  >
                    {isSavingFile[file.id] ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Speichern...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-5 w-5" />
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
