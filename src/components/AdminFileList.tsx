import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, X as LucideX, Edit, Save, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import React from "react";
import { uploadService } from '@/services/uploadService';
import api from "@/services/api";
import { validationStorage } from '@/utils/validationStorage';
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
  project_id?: number;
  publisher_id?: number;
  commission_group_id?: number;
  trigger_id?: number;
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
  // Kampagne für Orders-API beim „Aktualisieren“ (wie campaignService.getOrders)
  const [validationCampaignId, setValidationCampaignId] = useState<string>("122");
  const validationCampaigns = [
    { id: "260", name: "NEW Energie Kampagne" },
    { id: "122", name: "eprimo Kampagne" },
    { id: "207", name: "Ankerkraut Kampagne" },
  ];
  const campaignConfigByKey: Record<string, { id: string; name: string; commissionGroupId?: string; triggerId?: string; advertiserId?: string }> = {
    "newenergie": { id: "260", name: "NEW Energie", commissionGroupId: "912", triggerId: "6", advertiserId: "167" },
    "eprimo": { id: "122", name: "eprimo", commissionGroupId: "394", triggerId: "1" },
    "ankerkraut": { id: "207", name: "Ankerkraut" },
  };

  const normalizePartnerKey = (value?: string) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const resolveCampaignFromText = (value?: string) => {
    const normalized = normalizePartnerKey(value);
    if (!normalized) return null;
    for (const [key, cfg] of Object.entries(campaignConfigByKey)) {
      if (normalized.includes(key)) return cfg;
    }
    return null;
  };

  const resolvePartnerContext = (file: UploadItem) => {
    const advertiserUser =
      allUsers.find((u) => u.email === file.assigned_advertiser_email && u.role === "advertiser") ||
      allUsers.find((u) => u.company?.toLowerCase() === "new energie" && file.filename.toLowerCase().includes("new")) ||
      allUsers.find((u) => u.company?.toLowerCase() === "eprimo" && file.filename.toLowerCase().includes("eprimo"));

    const publisherUser =
      allUsers.find((u) => u.email === file.uploaded_by && u.role === "publisher") ||
      allUsers.find((u) => u.email === file.last_modified_by && u.role === "publisher");

    const campaignFromAdvertiser =
      resolveCampaignFromText(advertiserUser?.company) ||
      resolveCampaignFromText(advertiserUser?.name) ||
      resolveCampaignFromText(file.assigned_advertiser_email) ||
      resolveCampaignFromText(file.filename);

    const campaignFromDropdown = validationCampaigns.find((c) => c.id === validationCampaignId) || null;
    const effectiveCampaign =
      campaignFromAdvertiser ||
      (campaignFromDropdown ? { id: campaignFromDropdown.id, name: campaignFromDropdown.name.replace(" Kampagne", "") } : null);

    return {
      advertiserUser,
      publisherUser,
      effectiveCampaign,
      campaignFromDropdown,
    };
  };

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

  // ✅ Lade alle Validierungsergebnisse beim Laden der Uploads
  const loadAllValidations = useCallback(async () => {
    try {
      const validations = await uploadService.getAllValidations();
      // Konvertiere die Keys von String zu Number (weil Backend uint zurückgibt)
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
      console.log(`[loadAllValidations] Geladene Validierungen aus DB:`, Object.keys(convertedValidations).length);
    } catch (err) {
      console.error("[loadAllValidations] Fehler beim Laden der Validierungen:", err);
    }
  }, []);

  useEffect(() => {
    reloadUploads();
    
    // ✅ Lade zuerst Validierungen aus localStorage (sofort verfügbar, auch nach Reload)
    const storedValidations = validationStorage.loadAll();
    if (Object.keys(storedValidations).length > 0) {
      console.log(`[AdminFileList] Geladene Validierungen aus localStorage:`, Object.keys(storedValidations).length);
      setValidationData(storedValidations);
    }
    
    // ✅ Dann auch aus der DB laden (als Backup/Sync)
    loadAllValidations();
    
    const interval = setInterval(() => {
      reloadUploads();
      loadAllValidations();
    }, 10000);
    return () => clearInterval(interval);
  }, [reloadUploads, loadAllValidations]);

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

    // 2) Validation laden - NUR gespeicherte Validierungen laden, KEINE automatische Validierung
    // ✅ Validierungsergebnisse werden bereits beim Laden der Seite geladen (loadAllValidations + localStorage)
    // ✅ Falls noch nicht geladen, versuche sie jetzt zu laden (zuerst localStorage, dann DB)
    if (!validationData[id]) {
      // Versuche zuerst localStorage
      const stored = validationStorage.load(id);
      if (stored) {
        console.log(`[handleExpand] Gespeicherte Validierung aus localStorage geladen für file ${id}`);
        setValidationData(prev => ({ ...prev, [id]: stored }));
      } else {
        // Falls nicht in localStorage, versuche DB
        try {
          const v = await uploadService.getValidation(id);
          if (v) {
            console.log(`[handleExpand] Gespeicherte Validierung aus DB geladen für file ${id}`);
            setValidationData(prev => ({ ...prev, [id]: v }));
            // Speichere auch in localStorage für nächstes Mal
            validationStorage.save(id, v);
          }
        } catch (err: any) {
          // Keine Validierung vorhanden - das ist OK, wird beim Klick auf "Aktualisieren" durchgeführt
          console.log(`[handleExpand] Keine gespeicherte Validierung für file ${id}`);
        }
      }
    }
  };

  // ✅ Manuelle Aktualisierung der Validierung
  const handleRefreshValidation = async (id: number, file?: UploadItem) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bf8c079c-bc18-4556-97dc-e65c4aa3dc9e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminFileList.tsx:handleRefreshValidation',message:'Aktualisieren clicked',data:{uploadId:id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setIsValidating(prev => ({ ...prev, [id]: true }));
    setValidationError(prev => ({ ...prev, [id]: null }));

    validationIntervalsRef.current[id] = startFakeProgress(id);

    try {
      const partnerCtx = file ? resolvePartnerContext(file) : null;
      const campaignIdForValidation = partnerCtx?.effectiveCampaign?.id || validationCampaignId;
      if (campaignIdForValidation !== validationCampaignId) {
        setValidationCampaignId(campaignIdForValidation);
      }
      const projectIdForValidation =
        partnerCtx?.publisherUser?.project_id ? String(partnerCtx.publisherUser.project_id) : undefined;
      const publisherIdForValidation =
        partnerCtx?.publisherUser?.publisher_id ? String(partnerCtx.publisherUser.publisher_id) : undefined;
      const commissionGroupIdForValidation =
        partnerCtx?.advertiserUser?.commission_group_id
          ? String(partnerCtx.advertiserUser.commission_group_id)
          : undefined;
      const triggerIdForValidation =
        partnerCtx?.advertiserUser?.trigger_id ? String(partnerCtx.advertiserUser.trigger_id) : undefined;
      // ✅ Führe neue Validierung durch (Backend ruft Orders-API mit campaignId auf)
      const v = await uploadService.validateUpload(id, {
        campaignId: campaignIdForValidation,
        projectId: projectIdForValidation,
        publisherId: publisherIdForValidation,
        commissionGroupId: commissionGroupIdForValidation,
        triggerId: triggerIdForValidation,
      });
      // #region agent log
      const rowCount = v?.rows?.length ?? 0;
      const firstRowCells = v?.rows?.[0]?.cells ? Object.keys(v.rows[0].cells) : [];
      const statusCell = v?.rows?.[0]?.cells?.["Status in der uppr Performance Platform"];
      fetch('http://127.0.0.1:7242/ingest/bf8c079c-bc18-4556-97dc-e65c4aa3dc9e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminFileList.tsx:after validateUpload',message:'Validation response',data:{uploadId:id,rowsLength:rowCount,firstRowCellKeys:firstRowCells,statusCellValue:statusCell?.value,statusCellExists:!!statusCell},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,C,E'})}).catch(()=>{});
      // #endregion
      stopFakeProgress(id, 100);
      
      // ✅ Speichere die neuen Validierungsergebnisse im State
      setValidationData(prev => ({ ...prev, [id]: v }));
      
      // ✅ Speichere auch in localStorage (für Browser-Reload)
      validationStorage.save(id, v);
      
      toast({
        title: "Validierung aktualisiert",
        description: "Die Validierung wurde erfolgreich aktualisiert und gespeichert.",
      });
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf8c079c-bc18-4556-97dc-e65c4aa3dc9e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminFileList.tsx:validateUpload error',message:'Validate failed',data:{uploadId:id,errMessage:err?.message,status:err?.response?.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      stopFakeProgress(id, 0);
      const detail =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
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

  const handleExportMissingStatusCsv = async (file: UploadItem) => {
    const id = file.id;
    const table = fileData[id];
    if (!table || table.length === 0) {
      toast({
        title: "Kein Inhalt verfügbar",
        description: "Bitte Datei zuerst öffnen/laden.",
        variant: "destructive",
      });
      return;
    }

    const validationRows = validationData[id]?.rows;
    if (!Array.isArray(validationRows) || validationRows.length === 0) {
      toast({
        title: "Kein Vergleich vorhanden",
        description: "Bitte zuerst mit dem Netzwerk vergleichen.",
        variant: "destructive",
      });
      return;
    }

    const networkHeaders = [
      "id", "status", "timestamp", "campaign_id", "attribution", "delivered_tagcode_count",
      "delivered_tagcode_serversided_url", "ordertoken", "source", "project_id", "admedia_id", "type",
      "commission", "source_commission", "commission_group_id", "trigger_id", "description", "trigger_value",
      "trigger_type", "turnover", "attributed_turnover", "zone_id", "zone_name", "original_turnover",
      "action_id", "salary_id", "salary_timestamp", "session_id", "order_currency", "status_change_date",
      "cancel_reason", "source_turnover", "last_change", "user_agent", "order_actions_id", "bonus_id",
      "customer_journey_status", "ebestid", "order_timestamp", "action_timestamp", "trigger_title", "payoutdate",
      "campaign_group_title", "project_title", "campaign_title", "advertiser_id", "advertiser_title", "publisher_id",
      "referrer", "country", "subid", "publisher_prename", "publisher_surname", "publisher_searchtitle", "basket_items",
      "sub_status", "visibility", "external_sources_entity_id", "external_sources_currency_code",
      "external_sources_currency_rate", "external_sources_turnover", "source_project_id", "source_project_title",
      "order_request_id", "billing_date", "has_trace", "turnover_brutto", "network_commission", "network_fee",
      "network_fee_mode", "subid2", "bonh", "vc",
    ];

    const normalizeHeader = (value: string) =>
      String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const requiredHeaderCandidates = [
      ["publisher id"],
      ["subid", "sub id"],
      ["timestamp"],
      ["grund der anfrage"],
      ["ordertoken/orderid", "ordertoken/order id", "ordertoken"],
    ];

    const findHeaderRowIndex = (rows: string[][]) => {
      let bestIdx = 0;
      let bestScore = -1;
      rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) return;
        const normalized = new Set(row.map((cell) => normalizeHeader(String(cell ?? ""))));
        let score = 0;
        for (const candidates of requiredHeaderCandidates) {
          if (candidates.some((name) => normalized.has(name))) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = rowIndex;
        }
      });
      return bestIdx;
    };

    const headerRowIndex = findHeaderRowIndex(table);
    const header = table[headerRowIndex] || [];
    const dataRows = table.slice(headerRowIndex + 1).map((row, dataIndex) => ({ row, dataIndex }));

    const statusColIndex = header.findIndex(
      (col) => normalizeHeader(String(col || "")) === "status in der uppr performance platform"
    );

    const headerAliases: Record<string, string[]> = {
      id: ["id"],
      status: ["status", "status in der uppr performance platform"],
      timestamp: ["timestamp"],
      campaign_id: ["campaign_id", "campaign id"],
      ordertoken: ["ordertoken", "ordertoken/orderid", "ordertoken/order id", "ordertoken/orderid ", "ordertoken/order id "],
      source: ["source"],
      project_id: ["project_id", "project id"],
      commission: ["commission", "höhe der provision", "höhe der provision (optional)"],
      source_commission: ["source_commission", "source commission", "commission"],
      commission_group_id: ["commission_group_id", "commission group id"],
      trigger_id: ["trigger_id", "trigger id"],
      description: ["description", "grund der anfrage"],
      order_currency: ["order_currency", "order currency", "währung"],
      campaign_title: ["campaign_title", "campaign title", "kampagne"],
      advertiser_id: ["advertiser_id", "advertiser id"],
      advertiser_title: ["advertiser_title", "advertiser title", "kunde"],
      publisher_id: ["publisher_id", "publisher id"],
      country: ["country", "land"],
      subid: ["subid", "sub id"],
      publisher_prename: ["publisher_prename", "publisher prename", "vorname", "publisher vorname"],
      publisher_surname: ["publisher_surname", "publisher surname", "nachname", "publisher nachname"],
      publisher_searchtitle: ["publisher_searchtitle", "publisher searchtitle", "publisher", "vollständiger name"],
      order_timestamp: ["order_timestamp", "order timestamp", "timestamp"],
      action_timestamp: ["action_timestamp", "action timestamp", "timestamp"],
    };

    const buildRowMaps = (row: string[]) => {
      const byHeaderRaw: Record<string, string> = {};
      const byHeaderNormalized: Record<string, string> = {};
      header.forEach((h, i) => {
        const rawHeader = String(h || "").trim();
        if (!rawHeader) return;
        const value = String(row?.[i] ?? "");
        byHeaderRaw[rawHeader] = value;
        const normalizedKey = normalizeHeader(rawHeader);
        if (!(normalizedKey in byHeaderNormalized) || String(byHeaderNormalized[normalizedKey] || "").trim() === "") {
          byHeaderNormalized[normalizedKey] = value;
        }
      });
      return { byHeaderRaw, byHeaderNormalized };
    };

    const getByAliases = (normalizedMap: Record<string, string>, aliases: string[]) => {
      for (const alias of aliases) {
        const value = normalizedMap[normalizeHeader(alias)];
        if (String(value ?? "").trim() !== "") return value;
      }
      return "";
    };

    const hasBusinessSignal = (normalizedMap: Record<string, string>) => {
      const signalFields = [
        getByAliases(normalizedMap, headerAliases.ordertoken || []),
        getByAliases(normalizedMap, headerAliases.subid || []),
        getByAliases(normalizedMap, headerAliases.timestamp || []),
        getByAliases(normalizedMap, headerAliases.description || []),
      ];
      return signalFields.some((value) => String(value || "").trim() !== "");
    };

    const { publisherUser, advertiserUser, effectiveCampaign } = resolvePartnerContext(file);
    const campaignId = effectiveCampaign?.id || validationCampaignId;
    const campaignName = effectiveCampaign?.name || "campaign";

    const fallbackCfg =
      resolveCampaignFromText(campaignName) ||
      Object.values(campaignConfigByKey).find((cfg) => cfg.id === String(campaignId || "")) ||
      null;
    const derivedProjectId = publisherUser?.project_id ? String(publisherUser.project_id) : "";
    const derivedPublisherId = publisherUser?.publisher_id ? String(publisherUser.publisher_id) : "";
    const derivedTriggerId = advertiserUser?.trigger_id
      ? String(advertiserUser.trigger_id)
      : (fallbackCfg?.triggerId || "");
    const derivedCommissionGroupId = advertiserUser?.commission_group_id
      ? String(advertiserUser.commission_group_id)
      : (fallbackCfg?.commissionGroupId || "");
    const derivedAdvertiserId = fallbackCfg?.advertiserId || "";
    const isNewEnergieExport =
      derivedAdvertiserId === "167" ||
      String(campaignId || "") === "260" ||
      normalizePartnerKey(campaignName).includes("newenergie");

    const splitName = (value?: string) => {
      const cleaned = String(value || "").trim().replace(/\s+/g, " ");
      if (!cleaned) return { first: "", last: "" };
      const parts = cleaned.split(" ");
      if (parts.length === 1) return { first: cleaned, last: "" };
      return { first: parts[0], last: parts.slice(1).join(" ") };
    };
    const publisherNameParts = splitName(publisherUser?.name);

    const sanitize = (value: unknown) =>
      String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/;/g, ",")
        .trim();

    const normalizeTimestamp = (raw: string) => {
      const val = sanitize(raw);
      if (!val) return "";
      // DD/MM/YY[YY] [HH:mm] -> YYYY-MM-DD HH:mm:00+01
      const m = val.match(/^(\d{2})[./](\d{2})[./](\d{2}|\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
      if (m) {
        const day = m[1];
        const month = m[2];
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        const hh = m[4] ?? "00";
        const mm = m[5] ?? "00";
        return `${y}-${month}-${day} ${hh}:${mm}:00+01`;
      }
      return val;
    };

    const toNumberString = (raw: string) => {
      const cleaned = sanitize(raw).replace(/[€\s]/g, "").replace(",", ".");
      return cleaned;
    };

    const rowsWithoutStatus = dataRows
      .map(({ row, dataIndex }) => {
        const { byHeaderRaw, byHeaderNormalized } = buildRowMaps(row);
        return { row, dataIndex, byHeaderRaw, byHeaderNormalized };
      })
      .filter(({ row, dataIndex, byHeaderNormalized }) => {
        const statusValueInSheet =
          statusColIndex >= 0 ? String((row?.[statusColIndex] ?? "")).trim() : "";
        const vRow = validationRows[dataIndex];
        const statusCellFromCompare = vRow?.cells?.["Status in der uppr Performance Platform"];
        const statusValueFromCompare =
          statusCellFromCompare && typeof statusCellFromCompare === "object" && "value" in statusCellFromCompare
            ? String(statusCellFromCompare.value ?? "").trim()
            : "";

        const hasStatusInSheet = statusValueInSheet !== "";
        const hasStatusFromCompare = statusValueFromCompare !== "";
        if (hasStatusInSheet || hasStatusFromCompare) return false;

        // Verhindert Export von Meta-/Leerzeilen oberhalb/unterhalb der eigentlichen Daten.
        return hasBusinessSignal(byHeaderNormalized);
      });

    if (rowsWithoutStatus.length === 0) {
      toast({
        title: "Keine offenen Transaktionen",
        description: "Alle Transaktionen haben bereits einen Status.",
      });
      return;
    }

    const dataRecords = rowsWithoutStatus.map(({ byHeaderRaw, byHeaderNormalized, dataIndex }) => {
      const getSourceValue = (field: string) => {
        const fromAlias = getByAliases(byHeaderNormalized, headerAliases[field] || [field]);
        if (String(fromAlias || "").trim() !== "") return fromAlias;
        if (field === "ordertoken") {
          // Some publisher templates put the order reference into "Sonstige Daten..."
          // instead of the dedicated ordertoken column.
          const sonstigeKey = Object.keys(byHeaderNormalized).find((key) => key.includes("sonstige daten"));
          if (sonstigeKey) return byHeaderNormalized[sonstigeKey] || "";
        }
        return "";
      };

      const ordertoken = sanitize(getSourceValue("ordertoken"));
      const timestamp = normalizeTimestamp(getSourceValue("timestamp"));
      const publisherIdFromFile = sanitize(getSourceValue("publisher_id"));
      const subid = sanitize(getSourceValue("subid"));
      const apiCommissionRaw = validationRows?.[dataIndex]?.cells?.["Commission aus Netzwerk"]?.value;
      const fallbackCommissionRaw = getSourceValue("commission");
      const commission = toNumberString(apiCommissionRaw || fallbackCommissionRaw);
      const description = isNewEnergieExport ? "NBA" : sanitize(getSourceValue("description"));

      const record: Record<string, string> = {};
      networkHeaders.forEach((h) => {
        const source = getSourceValue(h);
        record[h] = sanitize(source);
      });

      record.id = "";
      record.status = "0";
      record.timestamp = timestamp;
      record.campaign_id = campaignId;
      record.ordertoken = ordertoken;
      // Enforce canonical partner project_id to avoid stale values from source files.
      record.project_id = sanitize(derivedProjectId || record.project_id);
      record.trigger_id = derivedTriggerId;
      record.commission_group_id = derivedCommissionGroupId;
      record.description = description;
      record.order_timestamp = timestamp;
      record.action_timestamp = timestamp;
      record.commission = commission;
      record.source_commission = commission;
      record.order_currency = "EUR";
      record.campaign_title = campaignName;
      record.advertiser_id = sanitize(record.advertiser_id || derivedAdvertiserId);
      record.advertiser_title = sanitize(record.advertiser_title || advertiserUser?.company || campaignName);
      record.publisher_id = sanitize(record.publisher_id || derivedPublisherId || publisherIdFromFile);
      record.publisher_prename = sanitize(record.publisher_prename || publisherNameParts.first);
      record.publisher_surname = sanitize(record.publisher_surname || publisherNameParts.last);
      record.publisher_searchtitle = sanitize(record.publisher_searchtitle || publisherUser?.name || "");
      record.project_title = sanitize(record.project_title || advertiserUser?.company || campaignName);
      record.source_project_title = sanitize(record.source_project_title || advertiserUser?.company || campaignName);
      record.subid = subid;
      record.country = sanitize(record.country || "DE");

      // Rohzeile für Nachvollziehbarkeit in proprietäres Feld (falls vorhanden) spiegeln.
      if (!record.vc) {
        record.vc = sanitize(JSON.stringify(byHeaderRaw));
      }

      return Object.fromEntries(
        networkHeaders.map((h) => [h, sanitize(record[h])])
      ) as Record<string, string>;
    });

    try {
      const exportResult = await uploadService.exportBookingCsv(id, {
        campaignId: String(campaignId || ""),
        campaignName: String(campaignName || "campaign"),
        headers: networkHeaders,
        records: dataRecords,
        overwriteLatest: true,
      });
      await uploadService.downloadBookingCsvExport(exportResult.csvExportId, exportResult.fileName);
      toast({
        title: "CSV exportiert",
        description: `${rowsWithoutStatus.length} Transaktionen ohne Status wurden exportiert (Version ${exportResult.version}).`,
      });
    } catch (err) {
      console.error("❌ exportBookingCsv error", err);
      const detail =
        (err as { response?: { data?: { detail?: string; error?: string } } })?.response?.data?.detail ||
        (err as { response?: { data?: { detail?: string; error?: string } } })?.response?.data?.error ||
        "Die Nachbuchungen konnten nicht gespeichert/exportiert werden.";
      toast({
        title: "CSV Export fehlgeschlagen",
        description: detail,
        variant: "destructive",
      });
      return;
    }

    if (!derivedProjectId || !derivedTriggerId) {
      const missing: string[] = [];
      if (!derivedProjectId) missing.push("project_id");
      if (!derivedTriggerId) missing.push("trigger_id");
      toast({
        title: "Hinweis zu Partner-IDs",
        description: `Nicht automatisch gefunden: ${missing.join(", ")}. Bitte Partner-Zuordnung prüfen.`,
        variant: "destructive",
      });
    }
  };

  const hasFileChanges = (fileId: number): boolean => {
    if (!fileData[fileId] || !originalFileData[fileId]) return false;
    return JSON.stringify(fileData[fileId]) !== JSON.stringify(originalFileData[fileId]);
  };

  const confirmDelete = async () => {
    if (fileToDelete) {
      try {
        await uploadService.deleteUpload(fileToDelete.id);
        
        // ✅ Entferne auch Validierungsergebnisse aus localStorage
        validationStorage.remove(fileToDelete.id);
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
    if (!dataRow?.cells) {
      // #region agent log
      if (rowIndex === 1) fetch('http://127.0.0.1:7242/ingest/bf8c079c-bc18-4556-97dc-e65c4aa3dc9e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminFileList.tsx:getRowStatus',message:'No dataRow or cells',data:{fileId,rowIndex,hasV:!!v,rowsLen:v?.rows?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return null;
    }

    const statusCell = dataRow.cells["Status in der uppr Performance Platform"];
    if (rowIndex === 1 && statusCell && typeof statusCell === "object" && "value" in statusCell) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf8c079c-bc18-4556-97dc-e65c4aa3dc9e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminFileList.tsx:getRowStatus',message:'Status found for row 1',data:{fileId,statusValue:statusCell.value},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    }
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
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <Label className="text-pink-600 font-medium text-xs">
                          {file.filename} ({fileData[file.id].length} Zeilen)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Select value={validationCampaignId} onValueChange={setValidationCampaignId}>
                            <SelectTrigger className="h-7 text-[10px] w-[180px]">
                              <SelectValue placeholder="Kampagne (API)…" />
                            </SelectTrigger>
                            <SelectContent>
                              {validationCampaigns.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {/* ✅ Aktualisieren-Button – ruft Backend-Validate auf (Orders-API mit campaignId) */}
                          {!isValidating[file.id] && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRefreshValidation(file.id, file)}
                              className="h-7 text-[10px] px-2"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {validationData[file.id]?.rows && validationData[file.id].rows.length > 0
                                ? "Aktualisieren"
                                : "Mit Netzwerk vergleichen"}
                            </Button>
                          )}
                          {file.status === "feedback_submitted" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportMissingStatusCsv(file)}
                              className="h-7 text-[10px] px-2"
                              title="Exportiert alle Zeilen ohne Status als CSV"
                            >
                              CSV ohne Status exportieren
                            </Button>
                          )}
                        </div>
                      </div>

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
                      {!isValidating[file.id] && validationData[file.id]?.rows && (
                        <p className="mb-2 text-[10px] text-gray-600">
                          Netzwerk-Abgleich durchgeführt: {validationData[file.id]?.ordersCount ?? 0} Orders geladen.
                        </p>
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
                                <td className={`border-r p-0.5 text-[10px] font-medium text-center sticky left-0 z-20 w-8 ${rowIndex === 0 ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-500"}`}>
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
                                    <td
                                      key={colIndex}
                                      className={`border-r p-0 min-w-[140px] ${rowIndex === 0 ? "bg-gray-100 sticky top-0 z-10" : ""} ${cellClass}`}
                                    >
                                      {rowIndex === 0 ? (
                                        <div
                                          className="px-2 py-1 text-[10px] font-semibold text-gray-800 whitespace-normal break-words leading-snug"
                                          title={displayValue}
                                        >
                                          {displayValue}
                                        </div>
                                      ) : (
                                        <Input
                                          value={displayValue}
                                          onChange={(e) => handleCellChange(file.id, rowIndex, colIndex, e.target.value)}
                                          className={`border-0 focus-visible:ring-1 h-6 text-[10px] px-2 py-0.5 w-full min-w-[120px] leading-tight bg-transparent ${cellClass}`}
                                        />
                                      )}
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