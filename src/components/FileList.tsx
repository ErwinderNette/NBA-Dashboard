
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileItem {
  filename: string;
  uploadDate: string;
  advertiser: string;
  status: 'active' | 'pending' | 'rejected';
}

const FileList = () => {
  const files: FileItem[] = [
    {
      filename: "20250415_NEWEnergie",
      uploadDate: "15.04.2025",
      advertiser: "NEW Energie",
      status: "active"
    },
    {
      filename: "20250401_eprimo",
      uploadDate: "01.04.2025",
      advertiser: "eprimo",
      status: "pending"
    },
    {
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

  const handleDownload = (filename: string) => {
    console.log(`Downloading file: ${filename}`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-6">Aktueller Stand</h3>
      
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
        {files.map((file, index) => (
          <div 
            key={index}
            className="grid grid-cols-12 gap-4 py-3 hover:bg-gray-50 transition-colors duration-150 rounded-lg"
          >
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
            <div className="col-span-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(file.filename)}
                className="p-1 h-8 w-8 hover:bg-gray-200"
              >
                <ArrowDown size={16} className="text-gray-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileList;
