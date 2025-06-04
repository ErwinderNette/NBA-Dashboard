
import { useState } from "react";
import { ArrowDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface FileItem {
  id: string;
  filename: string;
  uploadDate: string;
  publisher: string;
  assignedAdvertiser: string;
  status: 'pending' | 'assigned' | 'approved' | 'rejected';
}

const AdminFileList = () => {
  const { toast } = useToast();
  
  const [files, setFiles] = useState<FileItem[]>([
    {
      id: "1",
      filename: "20250415_NEWEnergie",
      uploadDate: "15.04.2025",
      publisher: "publisher@email.de",
      assignedAdvertiser: "",
      status: "pending"
    },
    {
      id: "2", 
      filename: "20250401_eprimo",
      uploadDate: "01.04.2025",
      publisher: "publisher@email.de",
      assignedAdvertiser: "eprimo@mail.de",
      status: "assigned"
    },
    {
      id: "3",
      filename: "20250315_Ankerkraut",
      uploadDate: "15.03.2025", 
      publisher: "test@uppr.de",
      assignedAdvertiser: "ankerkraut@mail.de",
      status: "approved"
    }
  ]);

  // Temporäre Auswahl für Dropdown-Werte
  const [tempAssignments, setTempAssignments] = useState<Record<string, string>>({});

  const advertisers = [
    { id: "advertiser1", name: "NEW Energie", email: "new-energie@mail.de" },
    { id: "advertiser2", name: "eprimo", email: "eprimo@mail.de" },
    { id: "advertiser3", name: "Ankerkraut", email: "ankerkraut@mail.de" },
    { id: "advertiser4", name: "Test Advertiser", email: "advertiser@mail.de" }
  ];

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
      case 'pending':
        return 'Ausstehend';
      case 'rejected':
        return 'Abgelehnt';
      default:
        return 'Unbekannt';
    }
  };

  const handleAdvertiserSelection = (fileId: string, advertiserEmail: string) => {
    setTempAssignments(prev => ({
      ...prev,
      [fileId]: advertiserEmail
    }));
  };

  const handleAdvertiserAssignment = (fileId: string) => {
    const selectedAdvertiserEmail = tempAssignments[fileId];
    if (!selectedAdvertiserEmail) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie zuerst einen Advertiser aus",
        variant: "destructive",
      });
      return;
    }

    setFiles(prev => prev.map(file => 
      file.id === fileId 
        ? { ...file, assignedAdvertiser: selectedAdvertiserEmail, status: 'assigned' as const }
        : file
    ));

    // Temporäre Auswahl entfernen
    setTempAssignments(prev => {
      const newTemp = { ...prev };
      delete newTemp[fileId];
      return newTemp;
    });

    const advertiser = advertisers.find(a => a.email === selectedAdvertiserEmail);
    toast({
      title: "Advertiser zugewiesen",
      description: `Datei wurde an ${advertiser?.name} weitergeleitet`,
    });
  };

  const handleStatusChange = (fileId: string, newStatus: 'approved' | 'rejected') => {
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, status: newStatus } : file
    ));

    toast({
      title: "Status geändert",
      description: `Datei wurde ${newStatus === 'approved' ? 'genehmigt' : 'abgelehnt'}`,
    });
  };

  const handleDownload = (filename: string) => {
    console.log(`Downloading file: ${filename}`);
    toast({
      title: "Download gestartet",
      description: `${filename} wird heruntergeladen`,
    });
  };

  const handleForward = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && file.assignedAdvertiser) {
      toast({
        title: "Datei weitergeleitet", 
        description: `${file.filename} wurde an ${file.assignedAdvertiser} weitergeleitet`,
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Admin - Upload Verwaltung</h3>
      <p className="text-gray-600 mb-6">
        Prüfe und weise Uploads den entsprechenden Advertisern zu.
      </p>
      
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-3">Dateiname</div>
          <div className="col-span-2">Upload Datum</div>
          <div className="col-span-2">Publisher</div>
          <div className="col-span-2">Advertiser</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Aktionen</div>
        </div>
        
        {/* File rows */}
        {files.map((file) => (
          <div 
            key={file.id}
            className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg"
          >
            <div className="col-span-3 text-gray-800 font-medium">
              {file.filename}
            </div>
            <div className="col-span-2 text-gray-600">
              {file.uploadDate}
            </div>
            <div className="col-span-2 text-gray-800">
              {file.publisher}
            </div>
            <div className="col-span-2">
              {file.status === 'pending' ? (
                <div className="flex items-center space-x-2">
                  <Select 
                    value={tempAssignments[file.id] || ""} 
                    onValueChange={(value) => handleAdvertiserSelection(file.id, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Advertiser wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {advertisers.map((advertiser) => (
                        <SelectItem key={advertiser.id} value={advertiser.email}>
                          {advertiser.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tempAssignments[file.id] && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAdvertiserAssignment(file.id)}
                      className="p-1 h-8 w-8 hover:bg-blue-50"
                    >
                      <Send size={14} className="text-blue-600" />
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-gray-800">
                  {advertisers.find(a => a.email === file.assignedAdvertiser)?.name || file.assignedAdvertiser}
                </span>
              )}
            </div>
            <div className="col-span-1 flex items-center">
              <div 
                className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}
                title={getStatusText(file.status)}
              />
            </div>
            <div className="col-span-2 flex items-center space-x-2">
              {file.status === 'assigned' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(file.id, 'approved')}
                    className="text-green-600 border-green-300 hover:bg-green-50"
                  >
                    ✓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(file.id, 'rejected')}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    ✗
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(file.filename)}
                className="p-1 h-8 w-8 hover:bg-gray-200"
              >
                <ArrowDown size={16} className="text-gray-600" />
              </Button>
              {file.assignedAdvertiser && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleForward(file.id)}
                  className="p-1 h-8 w-8 hover:bg-gray-200"
                >
                  →
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminFileList;
