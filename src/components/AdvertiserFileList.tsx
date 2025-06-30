import { useState } from "react";
import { ArrowDown, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadService } from '@/services/uploadService';

interface FileItem {
  id: number;
  filename: string;
  uploadDate: string;
  advertiser: string;
  status: 'active' | 'pending' | 'rejected';
}

const AdvertiserFileList = () => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<number, {
    feedback: string;
    status: string;
    additionalFeedback: string;
  }>>({});

  const files: FileItem[] = [
    {
      id: 1,
      filename: "20250415_NEWEnergie",
      uploadDate: "15.04.2025",
      advertiser: "NEW Energie",
      status: "active"
    },
    {
      id: 2,
      filename: "20250401_eprimo",
      uploadDate: "01.04.2025",
      advertiser: "eprimo",
      status: "pending"
    },
    {
      id: 3,
      filename: "20250315_Ankerkraut",
      uploadDate: "15.03.2025",
      advertiser: "Ankerkraut",
      status: "rejected"
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-pink-500';
      case 'pending':
        return 'bg-gray-400';
      case 'rejected':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const handleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
    if (!editData[id]) {
      setEditData(prev => ({
        ...prev,
        [id]: {
          feedback: '',
          status: 'pending',
          additionalFeedback: ''
        }
      }));
    }
  };

  const handleInputChange = (id: number, field: string, value: string) => {
    setEditData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSave = (id: number) => {
    console.log(`Saving data for file ${id}:`, editData[id]);
    setExpandedId(null);
    // Hier würde später der API-Call erfolgen
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      await uploadService.downloadFile(id, filename);
      // Optional: Toast anzeigen
    } catch (err) {
      // Optional: Toast für Fehler
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktuelle Uploads</h3>
      
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-4">Dateiname</div>
          <div className="col-span-2">Upload Datum</div>
          <div className="col-span-3">Advertiser</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Download</div>
        </div>
        
        {/* File rows */}
        {files.map((file) => (
          <div key={file.id}>
            <div className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg">
              <div className="col-span-4 text-gray-800 font-medium">
                {file.filename}
              </div>
              <div className="col-span-2 text-gray-600">
                {file.uploadDate}
              </div>
              <div className="col-span-3 text-gray-800">
                {file.advertiser}
              </div>
              <div className="col-span-2 flex items-center">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}></div>
              </div>
              <div className="col-span-1 flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExpand(file.id)}
                  className="p-1 h-8 w-8 hover:bg-gray-200"
                >
                  <Edit size={16} className="text-gray-600" />
                </Button>
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

            {/* Expandable edit section */}
            {expandedId === file.id && (
              <div className="bg-gray-50 rounded-lg p-6 mt-2 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Feedback Input */}
                  <div className="space-y-2">
                    <Label className="text-pink-600 font-medium">Feedback</Label>
                    <Input
                      value={editData[file.id]?.feedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'feedback', e.target.value)}
                      placeholder="Feedback eingeben..."
                      className="bg-white border-gray-300"
                    />
                  </div>

                  {/* Status Dropdown */}
                  <div className="space-y-2">
                    <Label className="text-pink-600 font-medium">Status in der uppr Performance Platform</Label>
                    <Select
                      value={editData[file.id]?.status || 'pending'}
                      onValueChange={(value) => handleInputChange(file.id, 'status', value)}
                    >
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue placeholder="Status auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">offen</SelectItem>
                        <SelectItem value="active">ausgeführt</SelectItem>
                        <SelectItem value="rejected">abgelehnt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Additional Feedback */}
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-pink-600 font-medium">Sonstiges Feedback</Label>
                    <Textarea
                      value={editData[file.id]?.additionalFeedback || ''}
                      onChange={(e) => handleInputChange(file.id, 'additionalFeedback', e.target.value)}
                      placeholder="Zusätzliches Feedback eingeben..."
                      rows={3}
                      className="bg-white border-gray-300"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setExpandedId(null)}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={() => handleSave(file.id)}
                    className="bg-pink-600 hover:bg-pink-700 text-white"
                  >
                    Speichern
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdvertiserFileList;
