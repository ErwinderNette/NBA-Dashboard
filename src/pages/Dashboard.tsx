import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";
import { uploadService } from "@/services/uploadService";
import { advertiserService } from "@/services/advertiserService";
import { Advertiser, UploadItem } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sessionMeta } from "@/utils/sessionMeta";
import { getStatusMeta, isFeedbackPipelineStatus } from "@/utils/uploadStatus";
import { sortUploads, type UploadListSortOrder } from "@/utils/uploadListSort";

type PublisherFilter = "all" | "pending" | "assigned" | "feedback" | "feedback_submitted" | "feedback_submitted_advertiser" | "sent_to_publisher_advertiser" | "returned_to_publisher";

const MANUAL_REQUEST_COLUMNS = [
  "Publisher ID",
  "Vollständiger Name des Endkunden",
  "Adresse des Endkunden",
  "E-Mailadresse des Endkunden",
  "Sonstige Daten/Dokumente des Endkunden (Optional)",
  "Höhe der Provision (Optional)",
  "Grund der Anfrage",
  "Timestamp",
  "SubID",
  "Ordertoken/OrderID",
  "Ordertoken/Order ID",
  "Abgeschlossener Tarif",
  "Belieferungsbeginn (Optional)",
  "Feedback",
  "Status in der uppr Performance Platform",
  "Sonstiges Feedback",
];

interface SavedPublisherView {
  id: string;
  name: string;
  filter: PublisherFilter;
  query: string;
}

interface TokenMatchPreview {
  headers: string[];
  rows: string[][];
}

const SAVED_VIEWS_KEY = "publisherDashboardSavedViews";
const REQUIRED_MANUAL_COLUMNS = [0, 1, 2, 3, 6];
const splitSearchTerms = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);

const toCompanyLabel = (value?: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.split("@")[0];
  return normalized;
};

const Dashboard = () => {
  const [allUploads, setAllUploads] = useState<UploadItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<PublisherFilter>("all");
  const [query, setQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedPublisherView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRows, setManualRows] = useState<string[][]>([
    Array(MANUAL_REQUEST_COLUMNS.length).fill(""),
  ]);
  const [isSubmittingManualRequest, setIsSubmittingManualRequest] = useState(false);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [selectedAdvertiserOption, setSelectedAdvertiserOption] = useState<string>("");
  const [manualValidationErrors, setManualValidationErrors] = useState<string[]>([]);
  const [manualSelectedCells, setManualSelectedCells] = useState<Set<string>>(new Set());
  const [manualSelectionStart, setManualSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [tokenMatchedFileIds, setTokenMatchedFileIds] = useState<Set<number> | null>(null);
  const [tokenMatchedPreviewByFile, setTokenMatchedPreviewByFile] = useState<Record<number, TokenMatchPreview>>({});
  const [isTokenSearchLoading, setIsTokenSearchLoading] = useState(false);
  const [listSortOrder, setListSortOrder] = useState<UploadListSortOrder>("newest");
  const manualCellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tokenIndexRef = useRef<Map<string, Set<number>>>(new Map());
  const indexedFileIdsRef = useRef<Set<number>>(new Set());
  const fileSearchCacheRef = useRef<Map<number, { headers: string[]; rows: string[][]; relevantColumns: number[] }>>(new Map());
  const { toast } = useToast();

  const fetchUploads = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const uploads = await uploadService.getUploads();
      setAllUploads(uploads);
    } catch {
      setError("Uploads konnten nicht geladen werden. Bitte aktualisiere die Seite.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
    advertiserService.getAdvertisers().then(setAdvertisers).catch(() => {
      toast({
        title: "Advertiser konnten nicht geladen werden",
        description: "Bitte Seite aktualisieren und erneut versuchen.",
        variant: "destructive",
      });
    });
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedPublisherView[];
      if (Array.isArray(parsed)) {
        setSavedViews(parsed);
      }
    } catch {
      // ignore malformed localStorage
    }
  }, []);

  const openFiles = useMemo(
    () =>
      allUploads.filter(
        (u) =>
          u.status === "pending" ||
          u.status === "returned_to_publisher" ||
          u.status === "assigned" ||
          u.status === "feedback" ||
          u.status === "feedback_submitted" ||
          u.status === "feedback_submitted_advertiser" ||
          u.status === "sent_to_publisher_advertiser"
      ),
    [allUploads]
  );
  const completedFiles = useMemo(
    () => allUploads.filter((u) => u.status === "completed"),
    [allUploads]
  );
  const actionRequiredCount = useMemo(
    () => openFiles.filter((u) => u.status === "returned_to_publisher" || isFeedbackPipelineStatus(u.status)).length,
    [openFiles]
  );
  const publisherVisibleManualColumnIndexes = useMemo(() => {
    const orderTokenColumnIndexes = MANUAL_REQUEST_COLUMNS.reduce<number[]>((acc, column, index) => {
      const normalized = column.toLowerCase().replace(/\s+/g, "");
      if (normalized.includes("ordertoken/orderid")) {
        acc.push(index);
      }
      return acc;
    }, []);
    if (orderTokenColumnIndexes.length < 2) {
      return MANUAL_REQUEST_COLUMNS.map((_, index) => index);
    }
    const secondOrderTokenIndex = orderTokenColumnIndexes[1];
    return MANUAL_REQUEST_COLUMNS.map((_, index) => index).filter((index) => index < secondOrderTokenIndex);
  }, []);
  const filteredOpenFiles = useMemo(() => {
    const byFilter =
      activeFilter === "all"
        ? openFiles
        : openFiles.filter((file) =>
            activeFilter === "feedback_submitted"
              ? file.status === "feedback_submitted" || file.status === "feedback_submitted_advertiser"
              : file.status === activeFilter
          );
    const normalizedQuery = query.trim().toLowerCase();
    const searchTerms = splitSearchTerms(query);
    if (!normalizedQuery) return byFilter;
    return byFilter.filter(
      (file) =>
        file.filename.toLowerCase().includes(normalizedQuery) ||
        file.uploaded_by.toLowerCase().includes(normalizedQuery) ||
        searchTerms.some((term) => file.filename.toLowerCase().includes(term) || file.uploaded_by.toLowerCase().includes(term)) ||
        (tokenMatchedFileIds?.has(file.id) ?? false)
    );
  }, [activeFilter, openFiles, query, tokenMatchedFileIds]);

  const sortedOpenFiles = useMemo(
    () => sortUploads(filteredOpenFiles, listSortOrder),
    [filteredOpenFiles, listSortOrder]
  );
  const sortedCompletedFiles = useMemo(
    () => sortUploads(completedFiles, listSortOrder),
    [completedFiles, listSortOrder]
  );

  const pendingCount = useMemo(
    () => openFiles.filter((f) => f.status === "pending").length,
    [openFiles]
  );
  const assignedCount = useMemo(
    () => openFiles.filter((f) => f.status === "assigned").length,
    [openFiles]
  );
  const feedbackPipelineCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback").length,
    [openFiles]
  );
  const inquiryCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback_submitted" || f.status === "feedback_submitted_advertiser").length,
    [openFiles]
  );
  const feedbackReceivedCount = useMemo(
    () => openFiles.filter((f) => f.status === "returned_to_publisher").length,
    [openFiles]
  );
  const statusLegend = useMemo(
    () => [
      { label: "Offen", count: pendingCount, dotClassName: "bg-slate-500", filter: "pending" as PublisherFilter },
      { label: "Rückfrage", count: inquiryCount, dotClassName: "bg-sky-500", filter: "feedback_submitted" as PublisherFilter },
      { label: "In Prüfung", count: assignedCount, dotClassName: "bg-yellow-500", filter: "assigned" as PublisherFilter },
      { label: "Netzwerk-Verarbeitung", count: feedbackPipelineCount, dotClassName: "bg-emerald-400", filter: "feedback" as PublisherFilter },
      { label: "Feedback erhalten", count: feedbackReceivedCount, dotClassName: "bg-emerald-700", filter: "returned_to_publisher" as PublisherFilter },
    ],
    [pendingCount, inquiryCount, feedbackPipelineCount, assignedCount, feedbackReceivedCount]
  );

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const searchTerms = splitSearchTerms(query);
    if (!normalizedQuery) {
      setTokenMatchedFileIds(null);
      setTokenMatchedPreviewByFile({});
      return;
    }

    let cancelled = false;
    const searchOrderTokenAndSubId = async () => {
      setIsTokenSearchLoading(true);
      try {
        const filesToIndex = openFiles.filter((file) => !indexedFileIdsRef.current.has(file.id));
        for (const file of filesToIndex) {
          try {
            const content = await uploadService.getFileContent(file.id);
            const rows = content.data || [];
            if (!rows.length) {
              indexedFileIdsRef.current.add(file.id);
              continue;
            }
            const headers = rows[0].map((header) => header || "");
            const normalizedHeaders = headers.map((header) => header.toLowerCase());
            const relevantColumns = normalizedHeaders.reduce<number[]>((acc, header, index) => {
              if (header.includes("ordertoken") || header.includes("subid")) {
                acc.push(index);
              }
              return acc;
            }, []);
            fileSearchCacheRef.current.set(file.id, {
              headers,
              rows: rows.slice(1),
              relevantColumns,
            });
            for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
              for (const columnIndex of relevantColumns) {
                const value = (rows[rowIndex]?.[columnIndex] || "").trim().toLowerCase();
                if (!value) continue;
                const current = tokenIndexRef.current.get(value) ?? new Set<number>();
                current.add(file.id);
                tokenIndexRef.current.set(value, current);
              }
            }
            indexedFileIdsRef.current.add(file.id);
          } catch {
            indexedFileIdsRef.current.add(file.id);
          }
        }

        const matches = new Set<number>();
        const previewByFile: Record<number, TokenMatchPreview> = {};
        tokenIndexRef.current.forEach((fileIds, key) => {
          if (key.includes(normalizedQuery) || searchTerms.some((term) => key.includes(term))) {
            fileIds.forEach((id) => matches.add(id));
          }
        });
        for (const [fileId, cached] of fileSearchCacheRef.current.entries()) {
          if (!cached.relevantColumns.length) continue;
          const matchedRows = cached.rows.filter((row) =>
            cached.relevantColumns.some((columnIndex) =>
              searchTerms.some((term) =>
                String(row?.[columnIndex] || "")
                  .toLowerCase()
                  .includes(term)
              ) || String(row?.[columnIndex] || "").toLowerCase().includes(normalizedQuery)
            )
          );
          if (matchedRows.length > 0) {
            previewByFile[fileId] = {
              headers: cached.headers,
              rows: matchedRows.slice(0, 5),
            };
            matches.add(fileId);
          }
        }
        if (!cancelled) {
          setTokenMatchedFileIds(matches);
          setTokenMatchedPreviewByFile(previewByFile);
        }
      } finally {
        if (!cancelled) {
          setIsTokenSearchLoading(false);
        }
      }
    };

    searchOrderTokenAndSubId();
    return () => {
      cancelled = true;
    };
  }, [query, openFiles]);

  const persistSavedViews = (next: SavedPublisherView[]) => {
    setSavedViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const resetView = () => {
    setActiveFilter("all");
    setQuery("");
    setListSortOrder("newest");
    sessionMeta.setLastAction("Filter und Suche zurückgesetzt");
  };

  const getParticipantsForFile = (file: UploadItem) => {
    const assignedAdvertiserEmail = (file as UploadItem & { assigned_advertiser_email?: string }).assigned_advertiser_email;
    const matchedAdvertiser = advertisers.find((advertiser) => advertiser.email === assignedAdvertiserEmail);
    const advertiserLabel = matchedAdvertiser?.name || toCompanyLabel(assignedAdvertiserEmail);
    const participants: Array<{ label: string; tone: "publisher" | "advertiser" }> = [];
    if (advertiserLabel) participants.push({ label: advertiserLabel, tone: "advertiser" });
    return participants;
  };

  const saveCurrentView = () => {
    const name = window.prompt("Name für diese Ansicht:");
    if (!name) return;
    const next = [
      ...savedViews,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        filter: activeFilter,
        query,
      },
    ];
    persistSavedViews(next);
    sessionMeta.setLastAction(`Saved View "${name.trim()}" gespeichert`);
  };

  const handleUploadSuccess = () => {
    sessionMeta.setLastAction("Neue Datei hochgeladen");
    setTimeout(() => {
      fetchUploads();
    }, 2000);
    window.dispatchEvent(new Event("uploads-updated"));
  };

  const handleDelete = async (file: { id?: number; name?: string; filename?: string }) => {
    if (file.id) {
      try {
        await uploadService.deleteUpload(file.id);
        sessionMeta.setLastAction(`Datei geloescht: ${file.name || file.filename || ""}`);
        toast({
          title: "Datei geloescht",
          description: `${file.name || file.filename} wurde erfolgreich gelöscht.`,
        });
        fetchUploads();
      } catch {
        toast({
          title: "Fehler beim Loeschen",
          description: "Die Datei konnte nicht geloescht werden.",
          variant: "destructive",
        });
      }
    }
  };

  const handleComplete = async (file: { id?: number; name?: string; filename?: string }) => {
    if (!file.id) return;
    try {
      await uploadService.completeUpload(file.id);
      sessionMeta.setLastAction(`Datei abgeschlossen: ${file.name || file.filename || ""}`);
      toast({
        title: "Datei abgeschlossen",
        description: `${file.name || file.filename} wurde abgeschlossen.`,
      });
      fetchUploads();
    } catch {
      toast({
        title: "Fehler beim Abschliessen",
        description: "Die Datei konnte nicht abgeschlossen werden.",
        variant: "destructive",
      });
    }
  };

  const handleRequestFeedback = async (
    file: { id?: number; name?: string; filename?: string },
    message: string,
    attachment?: File | null
  ) => {
    if (!file.id) return;
    try {
      await uploadService.requestFeedback(file.id, message, attachment);
      sessionMeta.setLastAction(`Feedback angefragt: ${file.name || file.filename || ""}`);
      toast({
        title: "Feedback angefragt",
        description: "Die Anfrage wurde an den Admin zur Bearbeitung weitergeleitet.",
      });
      fetchUploads();
      window.dispatchEvent(new Event("uploads-updated"));
    } catch {
      toast({
        title: "Fehler bei Feedback-Anfrage",
        description: "Die Anfrage konnte nicht gesendet werden.",
        variant: "destructive",
      });
    }
  };

  const addManualRow = () => {
    setManualRows((prev) => [...prev, Array(MANUAL_REQUEST_COLUMNS.length).fill("")]);
  };

  const removeManualRow = (rowIndex: number) => {
    setManualRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
  };

  const updateManualCell = (rowIndex: number, columnIndex: number, value: string) => {
    setManualRows((prev) => {
      const next = prev.map((row) => [...row]);
      next[rowIndex][columnIndex] = value;
      return next;
    });
    setManualValidationErrors((prev) => prev.filter((entry) => entry !== `${rowIndex}-${columnIndex}`));
  };

  const handleManualPaste = (
    rowIndex: number,
    columnIndex: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedText) return;

    let parsedRows = pastedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t").map((cell) => cell.trim()));

    // Wenn nur ein einzelnes Feld ohne Tab/Newline eingefügt wird, aber mehrere
    // Werte per Leerzeichen/Komma/Semikolon enthalten sind, vertikal verteilen.
    if (parsedRows.length === 1 && parsedRows[0].length === 1) {
      const singleValue = parsedRows[0][0];
      const tokenizedValues = singleValue
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (tokenizedValues.length > 1) {
        parsedRows = tokenizedValues.map((value) => [value]);
      }
    }

    if (!parsedRows.length) return;

    const shouldHandleAsMatrix =
      parsedRows.length > 1 || parsedRows.some((cells) => cells.length > 1);
    if (!shouldHandleAsMatrix) return;

    event.preventDefault();
    setManualRows((prev) => {
      const next = prev.map((row) => [...row]);
      const requiredRows = rowIndex + parsedRows.length;
      while (next.length < requiredRows) {
        next.push(Array(MANUAL_REQUEST_COLUMNS.length).fill(""));
      }

      parsedRows.forEach((cells, rowOffset) => {
        cells.forEach((cellValue, colOffset) => {
          const targetRow = rowIndex + rowOffset;
          const targetCol = columnIndex + colOffset;
          if (targetCol < MANUAL_REQUEST_COLUMNS.length) {
            next[targetRow][targetCol] = cellValue;
          }
        });
      });

      return next;
    });
    setManualValidationErrors((prev) =>
      prev.filter((entry) => {
        const [errorRow, errorCol] = entry.split("-").map(Number);
        if (errorRow < rowIndex || errorRow >= rowIndex + parsedRows.length) return true;
        if (errorCol < columnIndex) return true;
        return errorCol >= columnIndex + Math.max(...parsedRows.map((cells) => cells.length), 1);
      })
    );
  };

  const handleManualCellMouseDown = (rowIndex: number, columnIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    setManualSelectionStart({ row: rowIndex, col: columnIndex });
    setManualSelectedCells(new Set([`${rowIndex}-${columnIndex}`]));
  };

  const handleManualCellMouseEnter = (rowIndex: number, columnIndex: number, event: React.MouseEvent) => {
    if (event.buttons !== 1 || !manualSelectionStart) return;
    const nextSelection = new Set<string>();
    const minRow = Math.min(manualSelectionStart.row, rowIndex);
    const maxRow = Math.max(manualSelectionStart.row, rowIndex);
    const minCol = Math.min(manualSelectionStart.col, columnIndex);
    const maxCol = Math.max(manualSelectionStart.col, columnIndex);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        nextSelection.add(`${row}-${col}`);
      }
    }
    setManualSelectedCells(nextSelection);
  };

  useEffect(() => {
    const handleCopySelection = async (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return;
      if (manualSelectedCells.size === 0) return;
      event.preventDefault();

      const cells = Array.from(manualSelectedCells).map((entry) => {
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
          values.push(manualSelectedCells.has(key) ? manualRows[row]?.[col] || "" : "");
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
  }, [manualSelectedCells, manualRows, toast]);

  useEffect(() => {
    const clearSelection = () => {
      setManualSelectionStart(null);
    };
    window.addEventListener("mouseup", clearSelection);
    return () => window.removeEventListener("mouseup", clearSelection);
  }, []);

  const submitManualRequest = async () => {
    if (!selectedAdvertiserOption) {
      toast({
        title: "Advertiser fehlt",
        description: "Bitte zuerst einen Advertiser im Dropdown auswählen.",
        variant: "destructive",
      });
      return;
    }

    const hasAnyContent = manualRows.some((row) => row.some((cell) => cell.trim() !== ""));
    if (!hasAnyContent) {
      toast({
        title: "Keine Daten vorhanden",
        description: "Bitte mindestens eine Zeile ausfüllen, bevor du absendest.",
        variant: "destructive",
      });
      return;
    }

    const validationErrors: string[] = [];
    manualRows.forEach((row, rowIndex) => {
      const rowHasContent = row.some((cell) => cell.trim() !== "");
      if (!rowHasContent) return;
      REQUIRED_MANUAL_COLUMNS.forEach((columnIndex) => {
        if (!(row[columnIndex] || "").trim()) {
          validationErrors.push(`${rowIndex}-${columnIndex}`);
        }
      });
    });
    if (validationErrors.length > 0) {
      setManualValidationErrors(validationErrors);
      const [firstError] = validationErrors;
      manualCellRefs.current[firstError]?.focus();
      toast({
        title: "Pflichtfelder fehlen",
        description: "Bitte fülle die markierten Felder aus, bevor du absendest.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingManualRequest(true);
    try {
      const manualRequestPayload: {
        rows: string[][];
        advertiserId?: number;
        advertiserPresetName?: string;
      } = {
        rows: manualRows,
      };
      if (selectedAdvertiserOption.startsWith("id:")) {
        manualRequestPayload.advertiserId = Number(selectedAdvertiserOption.replace("id:", ""));
      } else if (selectedAdvertiserOption.startsWith("preset:")) {
        manualRequestPayload.advertiserPresetName = selectedAdvertiserOption.replace("preset:", "");
      }

      await uploadService.createManualRequest({
        ...manualRequestPayload,
      });
      toast({
        title: "Anfrage übermittelt",
        description: "Die händische Anfrage wurde als Datei erstellt und an den Admin übergeben.",
      });
      setManualRows([Array(MANUAL_REQUEST_COLUMNS.length).fill("")]);
      setManualValidationErrors([]);
      sessionMeta.setLastAction("Manuelle Anfrage erstellt und gesendet");
      fetchUploads();
      window.dispatchEvent(new Event("uploads-updated"));
    } catch {
      toast({
        title: "Fehler beim Absenden",
        description: "Die händische Anfrage konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingManualRequest(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <UploadArea onUploadSuccess={handleUploadSuccess} />

        <Accordion type="single" collapsible defaultValue="">
          <AccordionItem value="manual-request" className="rounded-2xl bg-white p-4 shadow-lg border-none">
            <AccordionTrigger className="py-0 hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg font-semibold text-slate-800">Manuelle Anfrage</h3>
                <p className="text-sm text-slate-500">
                  Schritt 1: Advertiser wählen. Schritt 2: Zeilen erfassen und Anfrage absenden.
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addManualRow}>
                Zeile hinzufügen
              </Button>
              <select
                value={selectedAdvertiserOption}
                onChange={(event) => setSelectedAdvertiserOption(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Advertiser auswählen</option>
                {advertisers.map((advertiser) => (
                  <option key={advertiser.id} value={`id:${advertiser.id}`}>
                    {advertiser.name || advertiser.email}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" onClick={submitManualRequest} disabled={isSubmittingManualRequest}>
                {isSubmittingManualRequest ? "Wird gesendet..." : "Anfrage absenden"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-[1100px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-slate-700">Aktion</th>
                  {publisherVisibleManualColumnIndexes.map((columnIndex) => (
                    <th key={MANUAL_REQUEST_COLUMNS[columnIndex]} className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-slate-700">
                      {MANUAL_REQUEST_COLUMNS[columnIndex]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manualRows.map((row, rowIndex) => (
                  <tr key={`manual-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                    <td className="border-b px-2 py-2 align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        disabled={manualRows.length === 1}
                        onClick={() => removeManualRow(rowIndex)}
                      >
                        Entfernen
                      </Button>
                    </td>
                    {publisherVisibleManualColumnIndexes.map((columnIndex) => (
                      <td
                        key={`manual-cell-${rowIndex}-${columnIndex}`}
                        className="border-b px-2 py-2"
                        onMouseDown={(event) => handleManualCellMouseDown(rowIndex, columnIndex, event)}
                        onMouseEnter={(event) => handleManualCellMouseEnter(rowIndex, columnIndex, event)}
                      >
                        <Input
                          ref={(el) => {
                            manualCellRefs.current[`${rowIndex}-${columnIndex}`] = el;
                          }}
                          value={row[columnIndex] || ""}
                          onChange={(event) => updateManualCell(rowIndex, columnIndex, event.target.value)}
                          onPaste={(event) => handleManualPaste(rowIndex, columnIndex, event)}
                          className={`h-8 min-w-[180px] ${
                            manualValidationErrors.includes(`${rowIndex}-${columnIndex}`) ? "border-red-500 focus-visible:ring-red-500" : ""
                          } ${manualSelectedCells.has(`${rowIndex}-${columnIndex}`) ? "ring-2 ring-sky-500 ring-offset-1" : ""}`}
                          aria-invalid={manualValidationErrors.includes(`${rowIndex}-${columnIndex}`)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Button variant={activeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("all")}>Alle</Button>
            <Button variant={activeFilter === "pending" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("pending")}>Offen</Button>
            <Button variant={activeFilter === "feedback_submitted" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback_submitted")}>Rückfrage</Button>
            <Button variant={activeFilter === "assigned" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("assigned")}>In Prüfung</Button>
            <Button variant={activeFilter === "feedback" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback")}>Netzwerk-Verarbeitung</Button>
            <Button variant={activeFilter === "returned_to_publisher" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("returned_to_publisher")}>Feedback erhalten</Button>
            <Input
              className="ml-auto w-72 shrink-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Datei, E-Mail, Ordertoken oder SubID..."
            />
            <Button variant="ghost" size="sm" onClick={resetView}>Zurücksetzen</Button>
            <Button variant="secondary" size="sm" onClick={saveCurrentView}>
              Aktuelle Ansicht speichern
            </Button>
            {savedViews.map((view) => (
              <div key={view.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
                <button
                  type="button"
                  className="text-slate-700 hover:text-slate-900"
                  onClick={() => {
                    setActiveFilter(view.filter);
                    setQuery(view.query);
                    sessionMeta.setLastAction(`Saved View "${view.name}" geoeffnet`);
                  }}
                >
                  {view.name} · {view.filter === "all" ? "alle" : view.filter}
                </button>
                <button
                  type="button"
                  className="text-red-500"
                  aria-label={`Saved View ${view.name} loeschen`}
                  onClick={() => persistSavedViews(savedViews.filter((entry) => entry.id !== view.id))}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {statusLegend.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveFilter(item.filter)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                <span className={`h-2 w-2 rounded-full ${item.dotClassName}`} />
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.count}</span>
              </button>
            ))}
          </div>
          {isTokenSearchLoading && query.trim() && (
            <p className="mb-2 text-xs text-slate-500">Suche in Ordertoken/SubID läuft...</p>
          )}

          {error && <div className="empty-state-card">{error}</div>}
          {!error && isLoading && <div className="empty-state-card">Uploads werden geladen...</div>}
          {!error && !isLoading && filteredOpenFiles.length === 0 && (
            <div className="empty-state-card">
              <p>Keine Treffer für diese Ansicht.</p>
              <p className="mt-1 text-sm text-slate-500">Passe Filter oder Suche an, oder lade eine neue Datei hoch.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={resetView}>Filter zurücksetzen</Button>
              </div>
            </div>
          )}
          {!error && !isLoading && filteredOpenFiles.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <FileList
                embedded
                listSortOrder={listSortOrder}
                onListSortOrderChange={setListSortOrder}
                files={sortedOpenFiles.map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
                  participants: getParticipantsForFile(file),
                  status: file.status,
                  statusColor: getStatusMeta(file.status).accentClassName,
                  id: file.id,
                  tokenMatchPreview: tokenMatchedPreviewByFile[file.id],
                }))}
                onDelete={handleDelete as never}
                onComplete={handleComplete as never}
                onRequestFeedback={handleRequestFeedback as never}
              />
            </div>
          )}
        </section>
        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                listSortOrder={listSortOrder}
                onListSortOrderChange={setListSortOrder}
                files={(sortedCompletedFiles ?? []).map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
                  participants: getParticipantsForFile(file),
                  status: file.status,
                  statusColor: getStatusMeta(file.status).accentClassName,
                  id: file.id,
                }))}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Dashboard;
