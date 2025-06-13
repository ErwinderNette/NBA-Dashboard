export interface UploadItem {
  id: number;
  filename: string;
  upload_date: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'granted';
  advertiser_count?: number;
}

export interface Advertiser {
  id: number;
  name: string;
  email: string;
} 