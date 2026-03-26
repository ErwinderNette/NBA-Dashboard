import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";
import { uploadService } from "@/services/uploadService";
import { UploadItem } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sessionMeta } from "@/utils/sessionMeta";

type PublisherFilter = "all" | "pending" | "assigned" | "feedback" | "returned_to_publisher";

interface SavedPublisherView {
  id: string;
  name: string;
  filter: PublisherFilter;
  query: string;
}

const SAVED_VIEWS_KEY = "publisherDashboardSavedViews";

const Dashboard = () => {
  const [allUploads, setAllUploads] = useState<UploadItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<PublisherFilter>("all");
  const [query, setQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedPublisherView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          u.status === "feedback_submitted"
      ),
    [allUploads]
  );
  const completedFiles = useMemo(
    () => allUploads.filter((u) => u.status === "completed"),
    [allUploads]
  );
  const filteredOpenFiles = useMemo(() => {
    const byFilter =
      activeFilter === "all"
        ? openFiles
        : openFiles.filter((file) =>
            activeFilter === "feedback" ? file.status === "feedback" || file.status === "feedback_submitted" : file.status === activeFilter
          );
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return byFilter;
    return byFilter.filter(
      (file) =>
        file.filename.toLowerCase().includes(normalizedQuery) ||
        file.uploaded_by.toLowerCase().includes(normalizedQuery)
    );
  }, [activeFilter, openFiles, query]);

  const trend = useMemo(() => {
    const lastSevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = allUploads.filter((u) => new Date(u.upload_date).getTime() >= lastSevenDays).length;
    return recent;
  }, [allUploads]);

  const persistSavedViews = (next: SavedPublisherView[]) => {
    setSavedViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const saveCurrentView = () => {
    const name = window.prompt("Name fuer diese Ansicht:");
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

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <section className="grid gap-3 md:grid-cols-4">
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Offen</p>
              <p className="text-2xl font-semibold">{openFiles.length}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Abgeschlossen</p>
              <p className="text-2xl font-semibold">{completedFiles.length}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Ruecklaeufer</p>
              <p className="text-2xl font-semibold">{openFiles.filter((f) => f.status === "returned_to_publisher").length}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Trend (7 Tage)</p>
              <p className="text-2xl font-semibold">+{trend}</p>
            </CardContent>
          </Card>
        </section>

        <UploadArea onUploadSuccess={handleUploadSuccess} />

        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant={activeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("all")}>Alle</Button>
            <Button variant={activeFilter === "pending" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("pending")}>Nur offen</Button>
            <Button variant={activeFilter === "assigned" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("assigned")}>In Pruefung</Button>
            <Button variant={activeFilter === "feedback" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback")}>Netzwerk-Verarbeitung</Button>
            <Button variant={activeFilter === "returned_to_publisher" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("returned_to_publisher")}>Feedback erhalten</Button>
            <Input
              className="ml-auto w-full max-w-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Datei oder Publisher suchen..."
            />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
                  {view.name}
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

          {error && <div className="empty-state-card">{error}</div>}
          {!error && isLoading && <div className="empty-state-card">Uploads werden geladen...</div>}
          {!error && !isLoading && filteredOpenFiles.length === 0 && (
            <div className="empty-state-card">
              <p>Keine Treffer fuer diese Ansicht.</p>
              <p className="mt-1 text-sm text-slate-500">Passe Filter oder Suche an, oder lade eine neue Datei hoch.</p>
            </div>
          )}
        </section>

        <FileList
          files={filteredOpenFiles.map(file => ({
            name: file.filename,
            uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
            advertiser: file.uploaded_by || '',
            status: file.status,
            statusColor: file.status === 'pending' ? '#e91e63' : file.status === 'approved' ? '#4caf50' : '#2196f3',
            id: file.id,
          }))}
          onDelete={handleDelete as never}
          onComplete={handleComplete as never}
        />
        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                files={(completedFiles ?? []).map(file => ({
                  name: file.filename,
                  uploadDate: file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : '',
                  advertiser: file.uploaded_by || '',
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

export default Dashboard;
