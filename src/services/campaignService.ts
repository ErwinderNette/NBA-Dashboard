import api from './api';

export interface CampaignOrder {
  id: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  // Weitere Felder je nach API-Response
}

export interface GetOrdersParams {
  campaignId: string;
  fromDate?: string;
  toDate?: string;
  paymentStatus?: string;
  statusList?: string[];
}

export const campaignService = {
  // Dynamische API-Aufrufe für Kampagnen-Bestellungen
  async getOrders(params: GetOrdersParams): Promise<CampaignOrder[]> {
    const {
      campaignId,
      fromDate = '2024-08-01',
      toDate = '2030-12-31',
      paymentStatus = 'all',
      statusList = ['open', 'confirmed', 'canceled', 'paidout']
    } = params;

    // Dynamischer URL-Aufbau basierend auf der Kampagne
    const urlSuffix = `/6115e2ebc15bf7cffcf39c56dfce109acc702fe1/admin/${campaignId}/get-orders.json`;
    
    const queryParams = new URLSearchParams({
      'condition[period][from]': fromDate,
      'condition[period][to]': toDate,
      'condition[paymentstatus]': paymentStatus,
      'condition[l:status]': statusList.join(','),
      'condition[l:campaigns]': campaignId,
    });

    try {
      const response = await api.get(`${urlSuffix}?${queryParams.toString()}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching orders for campaign ${campaignId}:`, error);
      throw error;
    }
  },

  // Weitere API-Methoden können hier hinzugefügt werden
  async getCampaigns(): Promise<any[]> {
    try {
      const response = await api.get('/campaigns');
      return response.data;
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  }
};
