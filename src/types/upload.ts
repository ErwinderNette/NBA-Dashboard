export interface UploadItem {
  id: number;
  filename: string;
  upload_date: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'granted' | 'returned_to_publisher' | 'completed' | 'assigned' | 'feedback' | 'feedback_submitted' | 'feedback_submitted_advertiser' | 'sent_to_publisher_advertiser';
  advertiser_count?: number;
  feedback_message?: string;
}

export interface Advertiser {
  id: number;
  name: string;
  email: string;
  company?: string;
}

/** Gespeicherte Validierungs-Antwort (Auszug für Tabellen-UI). */
export interface UploadValidationData {
  hasValidation?: boolean;
  rows?: Array<{
    cells?: Record<string, unknown>;
  }>;
}

/** Wie in localStorage (inkl. Metadaten). */
export type StoredUploadValidation = UploadValidationData & {
  savedAt?: string;
};
