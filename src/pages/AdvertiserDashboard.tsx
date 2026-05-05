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

type AdvertiserFilter = "all" | "assigned" | "feedback" | "returned_to_publisher";

interface SavedAdvertiserView {
  id: string;
  name: string;
  filter: AdvertiserFilter;
  query: string;
}

const SAVED_ADVERTISER_VIEWS_KEY = "advertiserDashboardSavedViews";

const AdvertiserDashboard = () => {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<AdvertiserFilter>("all");
  const [query, setQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedAdvertiserView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUploads = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const uploadsRaw = await uploadService.getUploads();
        const data = Array.isArray(uploadsRaw) ? uploadsRaw : [];
        const sortedUploads = [...data].sort((a, b) => {
          const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
          const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
          return dateB - dateA;
        });
        setUploads(sortedUploads);
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
  const completedFiles = useMemo(() => uploads.filter((u) => u.status === "completed"), [uploads]);
  const filteredOpenFiles = useMemo(() => {
    const byFilter =
      activeFilter === "all"
        ? openFiles
        : openFiles.filter((file) =>
            activeFilter === "feedback"
              ? file.status === "feedback" || file.status === "feedback_submitted"
              : file.status === activeFilter
          );
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return byFilter;
    return byFilter.filter(
      (file) =>
        file.filename.toLowerCase().includes(normalizedQuery) ||
        file.uploaded_by.toLowerCase().includes(normalizedQuery)
    );
  }, [activeFilter, openFiles, query]);

  const recentDelta = useMemo(() => {
    const lastSevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return uploads.filter((u) => new Date(u.upload_date).getTime() >= lastSevenDays).length;
  }, [uploads]);

  const persistSavedViews = (next: SavedAdvertiserView[]) => {
    setSavedViews(next);
    localStorage.setItem(SAVED_ADVERTISER_VIEWS_KEY, JSON.stringify(next));
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

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e91e63, #ad1457)' }}>
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
              <p className="text-xs uppercase text-slate-500">In Pruefung</p>
              <p className="text-2xl font-semibold">{openFiles.filter((f) => f.status === "assigned").length}</p>
            </CardContent>
          </Card>
          <Card className="ui-hover-lift">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-slate-500">Trend (7 Tage)</p>
              <p className="text-2xl font-semibold">+{recentDelta}</p>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant={activeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("all")}>
              Alle
            </Button>
            <Button
              variant={activeFilter === "assigned" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("assigned")}
            >
              Neu eingegangen
            </Button>
            <Button variant={activeFilter === "feedback" ? "default" : "outline"} size="sm" onClick={() => setActiveFilter("feedback")}>
              Feedback in Arbeit
            </Button>
            <Button
              variant={activeFilter === "returned_to_publisher" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter("returned_to_publisher")}
            >
              An Publisher zurück
            </Button>
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
              <p className="mt-1 text-sm text-slate-500">Passe Filter oder Suche an, um schneller die richtige Datei zu finden.</p>
            </div>
          )}
        </section>

        <AdvertiserFileList uploads={filteredOpenFiles} />

        <Accordion type="single" collapsible className="mt-10">
          <AccordionItem value="completed-files" className="bg-white rounded-2xl shadow-lg p-6">
            <AccordionTrigger className="text-xl font-semibold text-gray-800 mb-4">Abgeschlossene Dateien</AccordionTrigger>
            <AccordionContent>
              <FileList
                files={completedFiles.map(file => ({
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

export default AdvertiserDashboard;
