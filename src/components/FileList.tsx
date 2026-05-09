import { ArrowDown, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadService } from '@/services/uploadService';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import type { UploadValidationData } from "@/types/upload";
import { getStatusMeta, isFeedbackPipelineStatus } from "@/utils/uploadStatus";
import { useToast } from "@/hooks/use-toast";
import type { UploadListSortOrder } from "@/utils/uploadListSort";
import { UploadListSortMenu } from "@/components/UploadListSortMenu";

interface FileItem {
  name: string;
  uploadDate: string;
  advertiser: string;
  participants?: Array<{ label: string; tone: "publisher" | "advertiser" }>;
  status?: string;
  statusColor?: string;
  downloadUrl?: string;
  id?: number;
  tokenMatchPreview?: {
    headers: string[];
    rows: string[][];
  };
}

interface FileListProps {
  files: FileItem[];
  onDelete?: (file: FileItem) => void;
  onComplete?: (file: FileItem) => void; // NEU: Callback für Abschluss
  onRequestFeedback?: (file: FileItem, message: string, attachment?: File | null) => void | Promise<void>;
  embedded?: boolean;
  /** Wenn gesetzt: Sortier-Icon in einer Zeile mit der Überschrift „Aktueller Stand“. */
  listSortOrder?: UploadListSortOrder;
  onListSortOrderChange?: (order: UploadListSortOrder) => void;
}

const FileList = ({
  files,
  onDelete,
  onComplete,
  onRequestFeedback,
  embedded = false,
  listSortOrder,
  onListSortOrderChange,
}: FileListProps) => {
  const { toast } = useToast();
  const toCompanyLabel = (value: string) => {
    if (!value) return "";
    if (value.includes("@")) return value.split("@")[0];
    return value;
  };

  const getParticipants = (file: FileItem): Array<{ label: string; tone: "publisher" | "advertiser" }> => {
    if (file.participants?.length) return file.participants;
    if (!file.advertiser) return [];
    return [{ label: toCompanyLabel(file.advertiser), tone: "publisher" }];
  };

  const handleDownload = async (id?: number, name?: string) => {
    if (!id) return;
    await uploadService.downloadFile(id, name);
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [validationData, setValidationData] = useState<Record<number, UploadValidationData>>({});
  const [feedbackInputs, setFeedbackInputs] = useState<Record<number, string>>({});
  const [inlineMessages, setInlineMessages] = useState<Record<number, string>>({});
  const [showInquiryPanel, setShowInquiryPanel] = useState<Record<number, boolean>>({});
  const [inquirySent, setInquirySent] = useState<Record<number, boolean>>({});
  const [feedbackAttachments, setFeedbackAttachments] = useState<Record<number, File | null>>({});
  const feedbackFileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [previewSelectedCells, setPreviewSelectedCells] = useState<Record<number, Set<string>>>({});
  const [previewSelectionStart, setPreviewSelectionStart] = useState<Record<number, { row: number; col: number } | null>>({});

  // Lade Validierungsergebnisse für alle Dateien
  useEffect(() => {
    const loadValidations = async () => {
      console.log("🔍 [FileList] Lade Validierungen für Dateien:", files.map(f => ({ id: f.id, name: f.name, status: f.status })));
      const newValidationData: Record<number, UploadValidationData> = { ...validationData };

      for (const file of files) {
        if (!file.id) {
          console.log("⚠️ [FileList] Datei ohne ID gefunden:", file.name);
          continue;
        }
        // Nur laden wenn Status "assigned", "feedback" oder "feedback_submitted" ist
        if (file.status === 'assigned' || isFeedbackPipelineStatus(file.status)) {
          // Überspringe, wenn bereits geladen
          if (validationData[file.id]) {
            console.log(`✅ [FileList] Validierung bereits geladen für UploadID=${file.id}`);
            continue;
          }
          
          console.log(`🔄 [FileList] Lade Validierung für UploadID=${file.id}, Status=${file.status}`);
          try {
            const validation = await uploadService.getValidation(file.id);
            if (validation) {
              console.log(`✅ [FileList] Validierung gefunden für UploadID=${file.id}:`, validation);
              newValidationData[file.id] = validation;
            } else {
              console.log(`ℹ️ [FileList] Keine Validierung für UploadID=${file.id} (null zurückgegeben)`);
            }
          } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
              console.log(`ℹ️ [FileList] Keine Validierung für UploadID=${file.id} (404 - noch nicht validiert)`);
            } else {
              console.error(`❌ [FileList] Fehler beim Laden der Validierung für UploadID=${file.id}:`, err);
            }
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
  const getStatusSummary = (fileId?: number): { bestätigt: number; offen: number; storniert: number; ausgezahlt: number; neu: number } => {
    if (!fileId) return { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0, neu: 0 };
    
    const validation = validationData[fileId];
    if (!validation?.rows) return { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0, neu: 0 };

    const summary = { bestätigt: 0, offen: 0, storniert: 0, ausgezahlt: 0, neu: 0 };

    for (const row of validation.rows) {
      if (!row.cells) continue;
      const statusCell = row.cells["Status in der uppr Performance Platform"];
      if (statusCell && typeof statusCell === "object" && "value" in statusCell) {
        const statusValue = String(statusCell.value ?? "").trim().toLowerCase();
        if (statusValue === "bestätigt" || statusValue === "1") summary.bestätigt++;
        else if (statusValue === "offen" || statusValue === "0") summary.offen++;
        else if (statusValue === "storniert" || statusValue === "2") summary.storniert++;
        else if (statusValue === "ausgezahlt" || statusValue === "3") summary.ausgezahlt++;
        else summary.neu++;
      } else {
        summary.neu++;
      }
    }

    return summary;
  };

  const getProcessingProgress = (fileId?: number): { percentage: number; processed: number; total: number } => {
    const summary = getStatusSummary(fileId);
    const total = summary.bestätigt + summary.offen + summary.storniert + summary.ausgezahlt + summary.neu;
    if (total === 0) {
      return { percentage: 0, processed: 0, total: 0 };
    }
    const processed = summary.bestätigt + summary.storniert + summary.ausgezahlt;
    return {
      percentage: Math.round((processed / total) * 100),
      processed,
      total,
    };
  };

  const getSignalClasses = (status?: string) => {
    if (status === "sent_to_publisher_advertiser" || status === "feedback_submitted_advertiser") {
      return {
        bar: "bg-purple-500",
        text: "text-purple-700",
        track: "bg-purple-100",
      };
    }
    if (status === "returned_to_publisher") {
      return {
        bar: "bg-emerald-700",
        text: "text-emerald-800",
        track: "bg-emerald-100",
      };
    }
    if (status === "feedback_submitted") {
      return {
        bar: "bg-sky-500",
        text: "text-sky-700",
        track: "bg-sky-100",
      };
    }
    if (status === "feedback") {
      return {
        bar: "bg-emerald-400",
        text: "text-emerald-700",
        track: "bg-emerald-100",
      };
    }
    return {
      bar: "bg-yellow-500",
      text: "text-yellow-700",
      track: "bg-yellow-100",
    };
  };

  const isAdvertiserManualRequest = (file: FileItem): boolean =>
    (file.name || "").toLowerCase().startsWith("manual_request_advertiser_");

  const getProgressVisual = (file: FileItem, fileId: number) => {
    if (file.status === "feedback_submitted") {
      return {
        width: 55,
        label: "Rückfrage offen",
        detail: "",
      };
    }
    const progress = getProcessingProgress(fileId);
    return {
      width: progress.percentage,
      label: `${progress.percentage}% bearbeitet`,
      detail: `(${progress.processed}/${progress.total})`,
    };
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

  const handleFeedbackRequest = async (file: FileItem) => {
    if (!file.id || !onRequestFeedback) return;
    const feedbackMessage = (feedbackInputs[file.id] || "").trim();
    const attachment = feedbackAttachments[file.id] || null;
    await onRequestFeedback(file, feedbackMessage, attachment);
    setFeedbackInputs((prev) => ({ ...prev, [file.id!]: "" }));
    setFeedbackAttachments((prev) => ({ ...prev, [file.id!]: null }));
    if (feedbackFileInputs.current[file.id]) {
      feedbackFileInputs.current[file.id]!.value = "";
    }
    setInlineMessages((prev) => ({ ...prev, [file.id!]: "Rückfrage gesendet." }));
    setInquirySent((prev) => ({ ...prev, [file.id!]: true }));
    setShowInquiryPanel((prev) => ({ ...prev, [file.id!]: false }));
  };

  const handlePreviewCellMouseDown = (fileId: number, rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    setPreviewSelectionStart((prev) => ({ ...prev, [fileId]: { row: rowIndex, col: colIndex } }));
    setPreviewSelectedCells((prev) => ({ ...prev, [fileId]: new Set([`${rowIndex}-${colIndex}`]) }));
  };

  const handlePreviewCellMouseEnter = (fileId: number, rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    const start = previewSelectionStart[fileId];
    if (event.buttons !== 1 || !start) return;
    const selection = new Set<string>();
    const minRow = Math.min(start.row, rowIndex);
    const maxRow = Math.max(start.row, rowIndex);
    const minCol = Math.min(start.col, colIndex);
    const maxCol = Math.max(start.col, colIndex);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        selection.add(`${row}-${col}`);
      }
    }
    setPreviewSelectedCells((prev) => ({ ...prev, [fileId]: selection }));
  };

  useEffect(() => {
    const handleCopySelection = async (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return;
      const selectedEntry = Object.entries(previewSelectedCells).find(([, selection]) => selection && selection.size > 0);
      if (!selectedEntry) return;

      const [fileIdRaw, selection] = selectedEntry;
      const fileId = Number(fileIdRaw);
      const file = files.find((entry) => entry.id === fileId);
      const rows = file?.tokenMatchPreview?.rows;
      if (!rows || !selection || selection.size === 0) return;

      event.preventDefault();
      const cells = Array.from(selection).map((entry) => {
        const [row, col] = entry.split("-").map(Number);
        return { row, col };
      });
      const minRow = Math.min(...cells.map((cell) => cell.row));
      const maxRow = Math.max(...cells.map((cell) => cell.row));
      const minCol = Math.min(...cells.map((cell) => cell.col));
      const maxCol = Math.max(...cells.map((cell) => cell.col));

      const lines: string[] = [];
      for (let row = minRow; row <= maxRow; row++) {
        const values: string[] = [];
        for (let col = minCol; col <= maxCol; col++) {
          const key = `${row}-${col}`;
          values.push(selection.has(key) ? rows[row]?.[col] || "" : "");
        }
        lines.push(values.join("\t"));
      }

      try {
        await navigator.clipboard.writeText(lines.join("\n"));
      } catch {
        toast({
          title: "Kopieren fehlgeschlagen",
          description: "Bitte erneut versuchen.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("keydown", handleCopySelection);
    return () => window.removeEventListener("keydown", handleCopySelection);
  }, [previewSelectedCells, files, toast]);

  useEffect(() => {
    const clearSelection = () => {
      setPreviewSelectionStart({});
    };
    window.addEventListener("mouseup", clearSelection);
    return () => window.removeEventListener("mouseup", clearSelection);
  }, []);

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
      <div className={embedded ? "" : "bg-white rounded-2xl shadow-lg p-6"}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-gray-800">Aktueller Stand</h3>
          {listSortOrder != null && onListSortOrderChange ? (
            <UploadListSortMenu value={listSortOrder} onChange={onListSortOrderChange} />
          ) : null}
        </div>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[40px,minmax(0,2fr),minmax(0,1fr),minmax(0,1.2fr),minmax(0,1fr),72px,minmax(0,1.2fr)] gap-x-4 gap-y-0 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600 items-end">
            <div className="text-center">Löschen</div>
            <div className="min-w-0">Dateiname</div>
            <div className="min-w-0">Status</div>
            <div className="min-w-0 whitespace-nowrap">Upload Datum</div>
            <div className="min-w-0">Partner</div>
            <div className="text-center">Download</div>
            <div className="min-w-0">Aktionen</div>
          </div>
          {/* File rows */}
          {(files ?? []).length === 0 && (
            <div className="empty-state-card">
              <p>Hier sind aktuell keine Dateien sichtbar.</p>
              <p className="mt-1 text-sm text-slate-500">
                Lade eine neue Datei hoch oder passe deine Filter im Dashboard an.
              </p>
            </div>
          )}
          {(files ?? []).map((file, index) => (
            <div key={index} className="rounded-lg">
              <div className="grid grid-cols-[40px,minmax(0,2fr),minmax(0,1fr),minmax(0,1.2fr),minmax(0,1fr),72px,minmax(0,1.2fr)] gap-x-4 gap-y-0 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-start relative">
              {/* Overlay für pending entfernt */}
              <div className="flex justify-center pt-0.5">
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
              <div className="text-sm text-gray-800 font-medium truncate min-w-0 pt-0.5" title={file.name}>{file.name}</div>
              <div className="flex items-center min-w-0 pt-0.5">
                {(file.status === "returned_to_publisher" || file.status === "sent_to_publisher_advertiser") && file.id ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowInquiryPanel((prev) => ({ ...prev, [file.id!]: !prev[file.id!] }))
                    }
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      file.status === "returned_to_publisher" && isAdvertiserManualRequest(file)
                        ? "bg-purple-100 text-purple-700"
                        :
                      inquirySent[file.id]
                        ? "bg-sky-100 text-sky-700"
                        : getStatusMeta(file.status).badgeClassName
                    }`}
                    title="Klicken, um Rückfrage zu öffnen"
                    disabled={file.status === "returned_to_publisher" && isAdvertiserManualRequest(file)}
                  >
                    {file.status === "sent_to_publisher_advertiser"
                      ? "Anfrage vom Advertiser"
                      : isAdvertiserManualRequest(file)
                        ? "Beim Advertiser"
                        : "Feedback erhalten"}
                  </button>
                ) : (
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${file.status ? getStatusMeta(file.status).badgeClassName : "bg-slate-100 text-slate-700"}`}>
                    {file.status ? getStatusMeta(file.status).label : "Unbekannt"}
                  </span>
                )}
              </div>
              <div className="text-gray-600 tabular-nums pt-0.5 whitespace-nowrap">{file.uploadDate}</div>
              <div className="text-gray-800 flex flex-wrap gap-1 min-w-0 pt-0.5 items-center content-start">
                {getParticipants(file).map((participant, idx) => (
                  <span
                    key={`${participant.label}-${idx}`}
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      participant.tone === "publisher"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-fuchsia-100 text-fuchsia-700"
                    }`}
                  >
                    {participant.label}
                  </span>
                ))}
              </div>
              <div className="flex justify-center pt-0.5">
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
              {/* Aktionen-Spalte */}
              <div className="flex min-w-0 w-full flex-col items-stretch justify-start gap-0.5 pt-0.5">
                {file.status === 'returned_to_publisher' && onComplete && !isAdvertiserManualRequest(file) ? (
                  <div className="flex w-full max-w-sm items-center justify-start gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-emerald-700 border-emerald-600 hover:bg-emerald-50"
                      onClick={() => onComplete(file)}
                    >
                      Abschließen
                    </Button>
                  </div>
                ) : file.id && validationData[file.id] ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full max-w-[200px] min-w-0 cursor-default">
                          {(() => {
                            const visual = getProgressVisual(file, file.id);
                            return (
                              <>
                          <div className={`h-1 w-full overflow-hidden rounded-full ${getSignalClasses(file.status).track}`}>
                            <div
                              className={`h-full rounded-full ${getSignalClasses(file.status).bar}`}
                              style={{ width: `${visual.width}%` }}
                            />
                          </div>
                          <div className={`mt-0.5 text-left text-[10px] leading-tight tabular-nums ${getSignalClasses(file.status).text}`}>
                            {visual.label} {visual.detail}
                          </div>
                              </>
                            );
                          })()}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent align="start">
                        <div className="space-y-1 text-xs">
                          <div>{getStatusSummary(file.id).neu} neu</div>
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
                  file.id && (file.status === 'assigned' || file.status === 'feedback' || file.status === 'feedback_submitted' || file.status === 'feedback_submitted_advertiser') ? (
                    <span className="text-xs text-gray-400" title={`Debug: file.id=${file.id}, validationData[${file.id}]=${validationData[file.id] ? 'exists' : 'missing'}`}>
                      ⏳
                    </span>
                  ) : null
                )}
                {file.id && inlineMessages[file.id] && (
                  <span className="text-xs text-emerald-700">{inlineMessages[file.id]}</span>
                )}
              </div>
              </div>
              {file.tokenMatchPreview && file.tokenMatchPreview.rows.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">Trefferzeile(n) zur Suche</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          {file.tokenMatchPreview.headers.map((header, headerIndex) => (
                            <th
                              key={`token-header-${file.id}-${headerIndex}`}
                              className="whitespace-nowrap border-b px-2 py-1 text-left font-semibold text-slate-700"
                            >
                              {header || `Spalte ${headerIndex + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {file.tokenMatchPreview.rows.map((row, rowIndex) => (
                          <tr key={`token-row-${file.id}-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                            {file.tokenMatchPreview?.headers.map((_, columnIndex) => (
                              <td
                                key={`token-cell-${file.id}-${rowIndex}-${columnIndex}`}
                                className={`whitespace-nowrap border-b px-2 py-1 text-slate-700 select-none transition-colors ${
                                  previewSelectedCells[file.id || 0]?.has(`${rowIndex}-${columnIndex}`)
                                    ? "bg-slate-100"
                                    : ""
                                }`}
                                onMouseDown={(event) => file.id && handlePreviewCellMouseDown(file.id, rowIndex, columnIndex, event)}
                                onMouseEnter={(event) => file.id && handlePreviewCellMouseEnter(file.id, rowIndex, columnIndex, event)}
                              >
                                {row?.[columnIndex] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {((file.status === "sent_to_publisher_advertiser") || (file.status === "returned_to_publisher" && !isAdvertiserManualRequest(file))) && file.id && showInquiryPanel[file.id] && onRequestFeedback && (
                <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="file"
                      accept=".csv"
                      ref={(el) => {
                        feedbackFileInputs.current[file.id!] = el;
                      }}
                      onChange={(event) => {
                        const selected = event.target.files?.[0] ?? null;
                        setFeedbackAttachments((prev) => ({ ...prev, [file.id!]: selected }));
                      }}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => feedbackFileInputs.current[file.id!]?.click()}
                      title="CSV anhängen"
                    >
                      <Paperclip size={14} />
                    </Button>
                    <Input
                      value={feedbackInputs[file.id] || ""}
                      onChange={(event) => {
                        setFeedbackInputs((prev) => ({ ...prev, [file.id]: event.target.value }));
                      }}
                      placeholder="Nachricht"
                      className="h-8 w-full max-w-md bg-white"
                    />
                    {feedbackAttachments[file.id] && (
                      <span className="max-w-40 truncate text-xs text-slate-600" title={feedbackAttachments[file.id]!.name}>
                        {feedbackAttachments[file.id]!.name}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-sky-700 hover:bg-sky-100"
                      onClick={() => handleFeedbackRequest(file)}
                    >
                      {file.status === "sent_to_publisher_advertiser" ? "Senden" : "Rückfrage"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default FileList;
