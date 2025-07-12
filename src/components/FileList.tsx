import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileItem {
  name: string;
  uploadDate: string;
  advertiser: string;
  status?: string;
  statusColor?: string;
  downloadUrl?: string;
  id?: number;
}

interface FileListProps {
  files: FileItem[];
  onDelete?: (file: FileItem) => void;
}

const FileList = ({ files, onDelete }: FileListProps) => {
  const getStatusColor = (statusColor?: string) => {
    return statusColor || 'bg-pink-500';
  };

  const handleDownload = (downloadUrl?: string, name?: string) => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = name || '';
      link.click();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktueller Stand</h3>
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr] gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div>Löschen</div>
          <div>Dateiname</div>
          <div>Upload Datum</div>
          <div>Advertiser</div>
          <div>Status</div>
          <div>Download</div>
        </div>
        {/* File rows */}
        {files.map((file, index) => (
          <div
            key={index}
            className="grid grid-cols-[40px,2fr,1.2fr,1.2fr,1fr,1fr] gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg items-center"
          >
            <div className="flex justify-center">
              {onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(file)}
                  className="p-1 h-8 w-8"
                >
                  ×
                </Button>
              )}
            </div>
            <div className="text-gray-800 font-medium truncate" title={file.name}>{file.name}</div>
            <div className="text-gray-600">{file.uploadDate}</div>
            <div className="text-gray-800">{file.advertiser}</div>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(file.statusColor)}`}></div>
            </div>
            <div className="flex justify-center">
              {file.downloadUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(file.downloadUrl, file.name)}
                  className="p-1 h-8 w-8 hover:bg-gray-200"
                >
                  <ArrowDown size={16} className="text-gray-600" />
                </Button>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileList;
