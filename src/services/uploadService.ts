import axios from 'axios';
import api from './api';
import type { UploadItem, UploadValidationData } from '@/types/upload';

export interface BookingCSVExportPayload {
  campaignId: string;
  campaignName: string;
  headers: string[];
  records: Array<Record<string, string>>;
  overwriteLatest?: boolean;
}

export interface BookingCSVExportResponse {
  batchId: number;
  csvExportId: number;
  version: number;
  fileName: string;
  rowsCount: number;
}

export interface DuplicateOrderTokenConflict {
  uploadId: number;
  filename: string;
  rowIndex?: number;
  matchedColumn?: string;
}

export interface SaveContentWarning {
  type: 'duplicate_order_token';
  orderToken: string;
  currentUploadId: number;
  conflicts: DuplicateOrderTokenConflict[];
}

export interface SaveFileContentResponse {
  message: string;
  warnings?: SaveContentWarning[];
}

export interface ManualRequestPayload {
  rows: string[][];
  advertiserId?: number;
  advertiserPresetName?: string;
  publisherId?: number;
  publisherEmail?: string;
}

export const uploadService = {
  // Get all uploads
  getUploads: async (): Promise<UploadItem[]> => {
    const response = await api.get('/uploads');
    return Array.isArray(response.data) ? response.data : [];
  },

  // Grant access to an advertiser
  grantAccess: async (uploadId: number, advertiserId: number, expiresAt: Date): Promise<void> => {
    await api.post(`/uploads/${uploadId}/access`, {
      advertiserId,
      expiresAt: expiresAt.toISOString(),
    });
  },

  // Update upload status
  updateStatus: async (uploadId: number, status: 'approved' | 'rejected'): Promise<void> => {
    await api.patch(`/uploads/${uploadId}/status`, { status });
  },

  // Download file
  downloadFile: async (uploadId: number, filename?: string): Promise<void> => {
    const response = await api.get(`/uploads/${uploadId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `file_${uploadId}`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // Datei ersetzen
  replaceFile: async (uploadId: number, formData: FormData): Promise<void> => {
    await api.post(`/uploads/${uploadId}/replace`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Upload file
  uploadFile: async (formData: FormData): Promise<void> => {
    await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  createManualRequest: async (payload: ManualRequestPayload): Promise<void> => {
    await api.post('/uploads/manual-request', payload);
  },

  getPublishers: async (): Promise<Array<{ id: number; name: string; email: string }>> => {
    const response = await api.get('/publishers');
    return Array.isArray(response.data) ? response.data : [];
  },

  // Datei löschen
  deleteUpload: async (uploadId: number): Promise<void> => {
    await api.delete(`/uploads/${uploadId}`);
  },

  // Datei an Publisher zurückschicken
  returnToPublisher: async (uploadId: number): Promise<void> => {
    await api.post(`/uploads/${uploadId}/return-to-publisher`);
  },

  // Publisher fordert Feedback zur Datei an
  requestFeedback: async (uploadId: number, message: string, attachment?: File | null): Promise<void> => {
    if (attachment) {
      const formData = new FormData();
      formData.append("message", message);
      formData.append("file", attachment);
      await api.post(`/uploads/${uploadId}/request-feedback`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return;
    }
    await api.post(`/uploads/${uploadId}/request-feedback`, { message });
  },

  // Datei abschließen
  completeUpload: async (uploadId: number): Promise<void> => {
    await api.patch(`/uploads/${uploadId}/status`, { status: 'completed' });
  },

  // Datei-Inhalt lesen
  getFileContent: async (uploadId: number): Promise<{ data: string[][], filename: string }> => {
    const response = await api.get(`/uploads/${uploadId}/content`);
    return response.data;
  },

  // Datei-Inhalt speichern
  saveFileContent: async (uploadId: number, data: string[][]): Promise<SaveFileContentResponse> => {
    const response = await api.post(`/uploads/${uploadId}/content`, { data });
    return response.data;
  },

  
    // Validation für Admin-Preview (mit Debug). campaignId + Partner-Parameter für API-first Commission.
    validateUpload: async (
      uploadId: number,
      options?: {
        campaignId?: string;
        projectId?: string;
        publisherId?: string;
        commissionGroupId?: string;
        triggerId?: string;
        forceRefresh?: boolean;
      }
    ): Promise<UploadValidationData> => {
      try {
        const params: Record<string, string> = {};
        if (options?.campaignId) params.campaignId = options.campaignId;
        if (options?.projectId) params.projectId = options.projectId;
        if (options?.publisherId) params.publisherId = options.publisherId;
        if (options?.commissionGroupId) params.commissionGroupId = options.commissionGroupId;
        if (options?.triggerId) params.triggerId = options.triggerId;
        if (options?.forceRefresh) params.forceRefresh = "true";
        const response = await api.get(`/uploads/${uploadId}/validate`, {
          params,
          timeout: 120000, // 120s, weil API-Call groß sein kann
        });
        console.log("✅ validateUpload response", response.data);
        return response.data as UploadValidationData;
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          console.error("❌ validateUpload error", {
            message: err.message,
            status: err.response?.status,
            data: err.response?.data,
            url: err.config?.url,
            baseURL: err.config?.baseURL,
          });
        } else {
          console.error("❌ validateUpload error", err);
        }
        throw err;
      }
    },

    // Gespeicherte Validierungsergebnisse laden
    getValidation: async (uploadId: number): Promise<UploadValidationData | null> => {
      try {
        const response = await api.get(`/uploads/${uploadId}/validation`);
      if (response?.data?.hasValidation === false) {
        return null;
      }
      return response.data as UploadValidationData;
      } catch (err: unknown) {
        // 404 ist OK - bedeutet einfach, dass noch keine Validierung vorhanden ist
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        // Nur andere Fehler loggen, nicht 404
        if (!axios.isAxiosError(err) || err.response?.status !== 404) {
          console.error("❌ getValidation error", err);
        }
        throw err;
      }
    },

    // Alle Validierungsergebnisse auf einmal laden
    getAllValidations: async (): Promise<Record<string, UploadValidationData>> => {
      try {
        const response = await api.get('/uploads/validations');
        return response.data as Record<string, UploadValidationData>;
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          return {};
        }
        console.error("❌ getAllValidations error", err);
        return {};
      }
    },

    exportBookingCsv: async (
      uploadId: number,
      payload: BookingCSVExportPayload
    ): Promise<BookingCSVExportResponse> => {
      const response = await api.post(`/uploads/${uploadId}/bookings/csv`, payload);
      return response.data;
    },

    downloadBookingCsvExport: async (csvExportId: number, filename?: string): Promise<void> => {
      const response = await api.get(`/bookings/csv-exports/${csvExportId}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || `booking_export_${csvExportId}.CSV`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
};