import { UploadItem } from "@/types/upload";

export type UploadStatus = UploadItem["status"];

type StatusMeta = {
  label: string;
  badgeClassName: string;
  accentClassName: string;
};

const STATUS_META: Record<UploadStatus, StatusMeta> = {
  pending: {
    label: "Offen",
    badgeClassName: "bg-slate-100 text-slate-700",
    accentClassName: "bg-slate-400",
  },
  assigned: {
    label: "In Prüfung",
    badgeClassName: "bg-yellow-100 text-yellow-700",
    accentClassName: "bg-yellow-500",
  },
  feedback: {
    label: "Netzwerk-Verarbeitung",
    badgeClassName: "bg-emerald-100 text-emerald-700",
    accentClassName: "bg-emerald-400",
  },
  feedback_submitted: {
    label: "Rückfrage",
    badgeClassName: "bg-sky-100 text-sky-700",
    accentClassName: "bg-sky-500",
  },
  feedback_submitted_advertiser: {
    label: "Rückfrage (Advertiser)",
    badgeClassName: "bg-purple-100 text-purple-700",
    accentClassName: "bg-purple-500",
  },
  sent_to_publisher_advertiser: {
    label: "An Publisher gesendet",
    badgeClassName: "bg-purple-100 text-purple-700",
    accentClassName: "bg-purple-500",
  },
  returned_to_publisher: {
    label: "Feedback erhalten",
    badgeClassName: "bg-emerald-200 text-emerald-900",
    accentClassName: "bg-emerald-700",
  },
  approved: {
    label: "Ausgeführt",
    badgeClassName: "bg-indigo-100 text-indigo-700",
    accentClassName: "bg-indigo-500",
  },
  granted: {
    label: "Ausgeführt",
    badgeClassName: "bg-indigo-100 text-indigo-700",
    accentClassName: "bg-indigo-500",
  },
  rejected: {
    label: "Abgelehnt",
    badgeClassName: "bg-rose-100 text-rose-700",
    accentClassName: "bg-rose-500",
  },
  completed: {
    label: "Abgeschlossen",
    badgeClassName: "bg-green-100 text-green-700",
    accentClassName: "bg-green-500",
  },
};

export const getStatusMeta = (status: string): StatusMeta => {
  if (status in STATUS_META) {
    return STATUS_META[status as UploadStatus];
  }
  return {
    label: status || "Unbekannt",
    badgeClassName: "bg-slate-100 text-slate-700",
    accentClassName: "bg-slate-400",
  };
};

export const isFeedbackPipelineStatus = (status: string): boolean =>
  status === "feedback" || status === "feedback_submitted" || status === "feedback_submitted_advertiser" || status === "sent_to_publisher_advertiser";
