import Header from "@/components/Header";
import AdvertiserFileList from "@/components/AdvertiserFileList";
import { useEffect, useMemo, useState } from "react";
import { uploadService } from "@/services/uploadService";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import FileList from "@/components/FileList";
import { UploadItem } from "@/types/upload";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sessionMeta } from "@/utils/sessionMeta";
import { useToast } from "@/hooks/use-toast";
import { sortUploads, type UploadListSortOrder } from "@/utils/uploadListSort";

type AdvertiserFilter =
  | "all"
  | "assigned"
  | "feedback"
  | "feedback_submitted"
  | "feedback_submitted_advertiser"
  | "returned_to_publisher";

interface SavedAdvertiserView {
  id: string;
  name: string;
  filter: AdvertiserFilter;
  query: string;
}

const SAVED_ADVERTISER_VIEWS_KEY = "advertiserDashboardSavedViews";
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
const REQUIRED_MANUAL_COLUMNS = [0, 1, 2, 3, 6];
type PublisherOption = { id: number; name: string; email: string };

const toCompanyLabel = (value?: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.split("@")[0];
  return normalized;
};

const AdvertiserDashboard = () => {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<AdvertiserFilter>("all");
  const [query, setQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedAdvertiserView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRows, setManualRows] = useState<string[][]>([
    Array(MANUAL_REQUEST_COLUMNS.length).fill(""),
  ]);
  const [isSubmittingManualRequest, setIsSubmittingManualRequest] = useState(false);
  const [manualValidationErrors, setManualValidationErrors] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<PublisherOption[]>([]);
  const [selectedPublisherOption, setSelectedPublisherOption] = useState<string>("");
  const [listSortOrder, setListSortOrder] = useState<UploadListSortOrder>("newest");
  const { toast } = useToast();

  useEffect(() => {
    const fetchUploads = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const uploadsRaw = await uploadService.getUploads();
        const data = Array.isArray(uploadsRaw) ? uploadsRaw : [];
        setUploads(data);
      } catch {
        setError("Uploads konnten nicht geladen werden. Bitte spaeter erneut versuchen.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUploads();
    const reload = () => fetchUploads();
    window.addEventListener("uploads-updated", reload);
    return () => window.removeEventListener("uploads-updated", reload);
  }, []);

  useEffect(() => {
    uploadService
      .getPublishers()
      .then((result) => setPublishers(result))
      .catch(() => setPublishers([]));
  }, []);

  const publisherOptions = useMemo(() => {
    const fromApi = [...publishers];
    const seenEmails = new Set(fromApi.map((p) => p.email.toLowerCase()));
    const fallbackFromUploads = uploads
      .map((u) => (u.uploaded_by || "").trim())
      .filter((email) => email.includes("@"))
      .filter((email) => {
        const key = email.toLowerCase();
        if (seenEmails.has(key)) return false;
        seenEmails.add(key);
        return true;
      })
      .map((email, index) => ({
        id: -(index + 1),
        name: email,
        email,
      }));
    return [...fromApi, ...fallbackFromUploads];
  }, [publishers, uploads]);

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_ADVERTISER_VIEWS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedAdvertiserView[];
      if (Array.isArray(parsed)) setSavedViews(parsed);
    } catch {
      // ignore malformed localStorage
    }
  }, []);

  const openFiles = useMemo(() => uploads.filter((u) => u.status !== "completed"), [uploads]);
  const isAdvertiserManualRequest = (filename: string) =>
    (filename || "").toLowerCase().startsWith("manual_request_advertiser_");
  const completedFiles = useMemo(() => uploads.filter((u) => u.status === "completed"), [uploads]);
  const getParticipantsForFile = (file: UploadItem) => {
    const publisherLabel = toCompanyLabel(file.uploaded_by);
    const participants: Array<{ label: string; tone: "publisher" | "advertiser" }> = [];
    if (publisherLabel) participants.push({ label: publisherLabel, tone: "publisher" });
    return participants;
  };
  const filteredOpenFiles = useMemo(() => {
    const byFilter =
      activeFilter === "all"
        ? openFiles
        : openFiles.filter((file) => {
            if (activeFilter === "assigned") {
              return file.status === "assigned" || file.status === "pending";
            }
            if (activeFilter === "feedback_submitted") {
              return file.status === "feedback_submitted" || file.status === "feedback_submitted_advertiser";
            }
            return file.status === activeFilter;
          });
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return byFilter;
    return byFilter.filter(
      (file) =>
        file.filename.toLowerCase().includes(normalizedQuery) ||
        file.uploaded_by.toLowerCase().includes(normalizedQuery)
    );
  }, [activeFilter, openFiles, query]);

  const sortedOpenFiles = useMemo(
    () => sortUploads(filteredOpenFiles, listSortOrder),
    [filteredOpenFiles, listSortOrder]
  );
  const sortedCompletedFiles = useMemo(
    () => sortUploads(completedFiles, listSortOrder),
    [completedFiles, listSortOrder]
  );

  const recentDelta = useMemo(() => {
    const lastSevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return uploads.filter((u) => new Date(u.upload_date).getTime() >= lastSevenDays).length;
  }, [uploads]);

  const assignedCount = useMemo(
    () => openFiles.filter((f) => f.status === "assigned" || f.status === "pending").length,
    [openFiles]
  );
  const inquiryCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback_submitted" || f.status === "feedback_submitted_advertiser").length,
    [openFiles]
  );
  const feedbackPipelineCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback").length,
    [openFiles]
  );
  const feedbackPipelineManualCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback" && isAdvertiserManualRequest(f.filename)).length,
    [openFiles]
  );
  const feedbackPipelineDefaultCount = useMemo(
    () => openFiles.filter((f) => f.status === "feedback" && !isAdvertiserManualRequest(f.filename)).length,
    [openFiles]
  );
  const feedbackReceivedCount = useMemo(
    () => openFiles.filter((f) => f.status === "returned_to_publisher").length,
    [openFiles]
  );
  const feedbackReceivedManualCount = useMemo(
    () => openFiles.filter((f) => f.status === "returned_to_publisher" && isAdvertiserManualRequest(f.filename)).length,
    [openFiles]
  );
  const feedbackReceivedDefaultCount = useMemo(
    () => openFiles.filter((f) => f.status === "returned_to_publisher" && !isAdvertiserManualRequest(f.filename)).length,
    [openFiles]
  );
  const statusLegend = useMemo(
    () => [
      { label: "Neu", count: assignedCount, dotClassName: "bg-slate-400", filter: "assigned" as AdvertiserFilter },
      { label: "Rückfrage", count: inquiryCount, dotClassName: "bg-sky-500", filter: "feedback_submitted" as AdvertiserFilter },
      {
        label: "Netzwerk-Verarbeitung",
        count: feedbackPipelineCount,
        dotClassName: feedbackPipelineManualCount > 0 ? "bg-purple-500" : "bg-yellow-400",
        dotClassNames:
          feedbackPipelineManualCount > 0 && feedbackPipelineDefaultCount > 0
            ? ["bg-yellow-400", "bg-purple-500"]
            : undefined,
        filter: "feedback" as AdvertiserFilter,
      },
      {
        label: "Feedback erhalten",
        count: feedbackReceivedCount,
        dotClassName: feedbackReceivedManualCount > 0 ? "bg-purple-500" : "bg-emerald-700",
        dotClassNames:
          feedbackReceivedManualCount > 0 && feedbackReceivedDefaultCount > 0
            ? ["bg-emerald-700", "bg-purple-500"]
            : undefined,
        filter: "returned_to_publisher" as AdvertiserFilter,
      },
    ],
    [
      assignedCount,
      inquiryCount,
      feedbackPipelineCount,
      feedbackReceivedCount,
      feedbackPipelineManualCount,
      feedbackPipelineDefaultCount,
      feedbackReceivedManualCount,
      feedbackReceivedDefaultCount,
    ]
  );

  const persistSavedViews = (next: SavedAdvertiserView[]) => {
    setSavedViews(next);
    localStorage.setItem(SAVED_ADVERTISER_VIEWS_KEY, JSON.stringify(next));
  };

  const resetView = () => {
    setActiveFilter("all");
    setQuery("");
    setListSortOrder("newest");
    sessionMeta.setLastAction("Filter und Suche zurückgesetzt");
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

  const submitManualRequest = async () => {
    if (!selectedPublisherOption) {
      toast({
        title: "Publisher fehlt",
        description: "Bitte zuerst einen Publisher auswählen.",
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
      toast({
        title: "Pflichtfelder fehlen",
        description: "Bitte fülle die markierten Felder aus, bevor du absendest.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingManualRequest(true);
    try {
      const payload: { rows: string[][]; publisherId?: number; publisherEmail?: string } = {
        rows: manualRows,
      };
      if (selectedPublisherOption.startsWith("id:")) {
        payload.publisherId = Number(selectedPublisherOption.replace("id:", ""));
      } else if (selectedPublisherOption.startsWith("email:")) {
        payload.publisherEmail = selectedPublisherOption.replace("email:", "");
      }
      await uploadService.createManualRequest(payload);
      toast({
        title: "Anfrage übermittelt",
        description: "Die Anfrage wurde erstellt und als Advertiser-Rückfrage markiert.",
      });
      setManualRows([Array(MANUAL_REQUEST_COLUMNS.length).fill("")]);
      setManualValidationErrors([]);
      setSelectedPublisherOption("");
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e91e63, #ad1457)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Button variant={activeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("all")}>Alle</Button>
            <Button variant={activeFilter === "assigned" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("assigned")}>Neu</Button>
            <Button variant={activeFilter === "feedback_submitted" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback_submitted")}>Rückfrage</Button>
            <Button variant={activeFilter === "feedback" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback")}>Netzwerk-Verarbeitung</Button>
            <Button variant={activeFilter === "returned_to_publisher" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("returned_to_publisher")}>Feedback erhalten</Button>
            <Input
              className="ml-auto w-72 shrink-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen..."
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
            {statusLegend.filter((item) => item.count > 0).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveFilter(item.filter)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                {item.dotClassNames ? (
                  <span className="inline-flex items-center">
                    {item.dotClassNames.map((dotClassName, index) => (
                      <span
                        key={`${item.label}-${dotClassName}-${index}`}
                        className={`relative h-2 w-2 rounded-full ${dotClassName} ${index > 0 ? "-ml-1" : ""}`}
                        style={{ zIndex: item.dotClassNames!.length - index }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className={`h-2 w-2 rounded-full ${item.dotClassName}`} />
                )}
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.count}</span>
              </button>
            ))}
          </div>
          {error && <div className="empty-state-card">{error}</div>}
          {!error && isLoading && <div className="empty-state-card">Uploads werden geladen...</div>}
          {!error && !isLoading && filteredOpenFiles.length === 0 && (
            <div className="empty-state-card">
              <p>Keine Treffer für diese Ansicht.</p>
              <p className="mt-1 text-sm text-slate-500">Passe Filter oder Suche an, um schneller die richtige Datei zu finden.</p>
            </div>
          )}
          {!error && !isLoading && filteredOpenFiles.length > 0 && (
            <div className="mt-1 border-t border-slate-200 pt-4">
              <AdvertiserFileList
                uploads={sortedOpenFiles}
                embedded
                listSortOrder={listSortOrder}
                onListSortOrderChange={setListSortOrder}
              />
            </div>
          )}
        </section>

        <Accordion type="single" collapsible defaultValue="">
          <AccordionItem value="manual-request-advertiser" className="rounded-2xl bg-white p-4 shadow-lg border-none">
            <AccordionTrigger className="py-0 hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg font-semibold text-slate-800">Manuelle Anfrage</h3>
                <p className="text-sm text-slate-500">
                  Ausnahmefälle: Zeilen erfassen und Rückfrage zur Prüfung auslösen.
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
                    value={selectedPublisherOption}
                    onChange={(event) => setSelectedPublisherOption(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Publisher auswählen</option>
                    {publisherOptions.map((publisher) => (
                      <option
                        key={`${publisher.id}-${publisher.email}`}
                        value={publisher.id > 0 ? `id:${publisher.id}` : `email:${publisher.email}`}
                      >
                        {publisher.name || publisher.email}
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
                      {MANUAL_REQUEST_COLUMNS.map((column) => (
                        <th key={column} className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-slate-700">
                          {column}
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
                        {MANUAL_REQUEST_COLUMNS.map((_, columnIndex) => (
                          <td key={`manual-cell-${rowIndex}-${columnIndex}`} className="border-b px-2 py-2">
                            <Input
                              value={row[columnIndex] || ""}
                              onChange={(event) => updateManualCell(rowIndex, columnIndex, event.target.value)}
                              className={`h-8 min-w-[180px] ${
                                manualValidationErrors.includes(`${rowIndex}-${columnIndex}`)
                                  ? "border-red-500 focus-visible:ring-red-500"
                                  : ""
                              }`}
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

        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                listSortOrder={listSortOrder}
                onListSortOrderChange={setListSortOrder}
                files={sortedCompletedFiles.map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
                  participants: getParticipantsForFile(file),
                  status: file.status,
                  statusColor: '#4caf50',
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

export default AdvertiserDashboard;
