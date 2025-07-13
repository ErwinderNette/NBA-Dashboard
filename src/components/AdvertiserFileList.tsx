import { useState, useEffect, useRef } from "react";
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
import { UploadItem } from '@/types/upload';
import { useToast } from "@/hooks/use-toast";

const AdvertiserFileList = () => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<number, {
    feedback: string;
    status: string;
    additionalFeedback: string;
  }>>({});
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
  const [isUploading, setIsUploading] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchUploads = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const allUploads = await uploadService.getUploads();
        setUploads(allUploads); // KEIN Filter mehr!
      } catch (err) {
        setError('Fehler beim Laden der Uploads.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUploads();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'granted':
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

  // Handler für Datei-Auswahl
  const handleFileChange = (uploadId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setSelectedFiles(prev => ({ ...prev, [uploadId]: file }));
  };

  // Handler für Datei ersetzen
  const handleReplaceFile = async (uploadId: number) => {
    const file = selectedFiles[uploadId];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(prev => ({ ...prev, [uploadId]: true }));
    try {
      await uploadService.replaceFile(uploadId, formData);
      toast({ title: 'Datei ersetzt', description: 'Die Datei wurde erfolgreich ersetzt.' });
      setSelectedFiles(prev => ({ ...prev, [uploadId]: null }));
      if (fileInputs.current[uploadId]) fileInputs.current[uploadId]!.value = '';
      window.location.reload();
    } catch (err) {
      toast({ title: 'Fehler', description: 'Die Datei konnte nicht ersetzt werden.', variant: 'destructive' });
    } finally {
      setIsUploading(prev => ({ ...prev, [uploadId]: false }));
    }
  };

  if (isLoading) {
    return <div>Lade Dateien...</div>;
  }
  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktuelle Uploads</h3>
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-4">Dateiname</div>
          <div className="col-span-2">Upload Datum</div>
          <div className="col-span-3">Publisher</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Upload</div>
          <div className="col-span-1">Download</div>
        </div>
        {/* File rows */}
        {(uploads ?? []).length === 0 && <div className="py-4 text-gray-500">Keine Dateien gefunden.</div>}
        {(uploads ?? []).map((file) => (
          <div key={file.id}>
            <div className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center">
              <div
                className="col-span-4 text-gray-800 font-medium truncate max-w-[350px] cursor-pointer"
                title={file.filename}
              >
                {file.filename}
              </div>
              <div className="col-span-2 text-gray-600">
                {file.upload_date ? new Date(file.upload_date).toLocaleDateString('de-DE') : ''}
              </div>
              <div className="col-span-3 text-gray-800">
                {file.uploaded_by}
              </div>
              <div className="col-span-2 flex items-center">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(file.status)}`}></div>
              </div>
              {/* Upload/Ersetzen */}
              <div className="col-span-1 flex flex-col items-start space-y-1">
                <input
                  type="file"
                  style={{ display: 'none' }}
                  ref={el => fileInputs.current[file.id] = el}
                  onChange={e => handleFileChange(file.id, e)}
                  accept=".csv,.xls,.xlsx,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                />
                <button
                  className="text-blue-600 underline text-sm"
                  onClick={() => fileInputs.current[file.id]?.click()}
                  type="button"
                  disabled={isUploading[file.id]}
                >
                  Ersetzen
                </button>
                {selectedFiles[file.id] && (
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-700 truncate max-w-[100px]">{selectedFiles[file.id]?.name}</span>
                    <button
                      className="ml-2 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                      onClick={() => handleReplaceFile(file.id)}
                      type="button"
                      disabled={isUploading[file.id]}
                    >
                      {isUploading[file.id] ? 'Hochladen...' : 'Hochladen'}
                    </button>
                  </div>
                )}
              </div>
              {/* Download */}
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
                        <SelectItem value="approved">ausgeführt</SelectItem>
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
