
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { campaignService, type CampaignOrder } from '@/services/campaignService';
import { useToast } from '@/hooks/use-toast';

const CampaignSelector = () => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('122');
  const [orders, setOrders] = useState<CampaignOrder[]>([]);
  const { toast } = useToast();

  // Beispiel-Kampagnen (in einer echten App würden diese von der API kommen)
  const campaigns = [
    { id: '122', name: 'NEW Energie Kampagne' },
    { id: '123', name: 'eprimo Kampagne' },
    { id: '124', name: 'Ankerkraut Kampagne' },
  ];

  const { data: campaignOrders, isLoading, refetch } = useQuery({
    queryKey: ['campaignOrders', selectedCampaignId],
    queryFn: () => campaignService.getOrders({ 
      campaignId: selectedCampaignId,
      fromDate: '2024-08-01',
      toDate: '2030-12-31'
    }),
    enabled: !!selectedCampaignId,
  });

  const handleCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    console.log(`Kampagne gewechselt zu: ${campaignId}`);
    console.log(`API Base URL: ${import.meta.env.VITE_API_BASE_URL}`);
  };

  const handleLoadOrders = async () => {
    try {
      await refetch();
      toast({
        title: "Bestellungen geladen",
        description: `Bestellungen für Kampagne ${selectedCampaignId} wurden erfolgreich geladen`,
      });
    } catch (error) {
      toast({
        title: "Fehler beim Laden",
        description: "Die Bestellungen konnten nicht geladen werden",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <h3 className="text-xl font-semibold text-gray-800">Kampagnen-Management</h3>
      
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Kampagne auswählen:
          </label>
          <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
            <SelectTrigger>
              <SelectValue placeholder="Kampagne wählen..." />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name} (ID: {campaign.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button 
          onClick={handleLoadOrders}
          disabled={isLoading}
          className="mt-6"
        >
          {isLoading ? 'Lädt...' : 'Bestellungen laden'}
        </Button>
      </div>

      {campaignOrders && (
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            API-Aufruf erfolgreich für Kampagne {selectedCampaignId}
          </p>
          <p className="text-xs text-gray-500">
            Basis-URL: {import.meta.env.VITE_API_BASE_URL}
          </p>
        </div>
      )}
    </div>
  );
};

export default CampaignSelector;
