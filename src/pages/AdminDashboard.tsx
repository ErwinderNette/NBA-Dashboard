import Header from "@/components/Header";
import AdminFileList from "@/components/AdminFileList";
import { useState, useEffect } from "react";
import { uploadService } from "@/services/uploadService";
import { advertiserService } from "@/services/advertiserService";
import { UploadItem, Advertiser } from "@/types/upload";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const AdminDashboard = () => {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch both uploads and advertisers in parallel
        const [uploadsData, advertisersData] = await Promise.all([
          uploadService.getUploads(),
          advertiserService.getAdvertisers()
        ]);

        setUploads(uploadsData);
        setAdvertisers(advertisersData);
      } catch (err) {
        setError('Failed to load data. Please try again later.');
        toast({
          title: "Error",
          description: "Failed to load data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Listener für Upload-Updates
    const reload = () => fetchData();
    window.addEventListener("uploads-updated", reload);
    return () => window.removeEventListener("uploads-updated", reload);
  }, [toast]);

  const handleGrantAccess = async (uploadId: number, advertiserId: number, expiresAt: Date) => {
    try {
      await uploadService.grantAccess(uploadId, advertiserId, expiresAt);
      
      // Update the local state to reflect the change
      setUploads(prevUploads => 
        prevUploads.map(upload => 
          upload.id === uploadId 
            ? { ...upload, status: 'granted' }
            : upload
        )
      );

      toast({
        title: "Success",
        description: "Access granted successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to grant access. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <AdminFileList 
          uploads={uploads}
          advertisers={advertisers}
          onGrantAccess={handleGrantAccess}s
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
