import api from './api';
import { Advertiser } from '@/types/upload';

export const advertiserService = {
  // Get all advertisers
  getAdvertisers: async (): Promise<Advertiser[]> => {
    const response = await api.get('/advertisers');
    return response.data;
  },
}; 