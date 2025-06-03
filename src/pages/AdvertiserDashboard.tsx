
import React, { useState, useEffect } from 'react';
import { User, LogOut, Download, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

interface Upload {
  id: string;
  filename: string;
  uploaded_at: string;
  publisher_email: string;
  status: 'pending' | 'approved' | 'rejected';
  feedback?: string;
  downloadUrl?: string;
}

const AdvertiserDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const userEmail = localStorage.getItem("userEmail") || "advertiser@mail.de";
  
  const [uploads, setUploads] = useState<Upload[]>([
    {
      id: '1',
      filename: '20250415_NEWEnergie.xlsx',
      uploaded_at: '2025-04-15',
      publisher_email: 'NEW Energie',
      status: 'approved',
      feedback: '',
      downloadUrl: '#'
    },
    {
      id: '2', 
      filename: '20250401_eprimo.xlsx',
      uploaded_at: '2025-04-01',
      publisher_email: 'eprimo',
      status: 'pending',
      feedback: '',
      downloadUrl: '#'
    },
    {
      id: '3',
      filename: '20250315_Ankerkraut.xlsx', 
      uploaded_at: '2025-03-15',
      publisher_email: 'Ankerkraut',
      status: 'rejected',
      feedback: '',
      downloadUrl: '#'
    }
  ]);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackData, setFeedbackData] = useState<{[key: string]: {status: string, feedbackText: string, extraFeedback: string}}>({});

  useEffect(() => {
    // Initialize feedback data for each upload
    const initial: {[key: string]: {status: string, feedbackText: string, extraFeedback: string}} = {};
    uploads.forEach(upload => {
      initial[upload.id] = {
        status: upload.status,
        feedbackText: upload.feedback || '',
        extraFeedback: ''
      };
    });
    setFeedbackData(initial);
  }, [uploads]);

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    
    toast({
      title: "Erfolgreich abgemeldet",
      description: "Sie wurden sicher abgemeldet.",
    });
    
    navigate("/login");
  };

  const handleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleChange = (uploadId: string, field: string, value: string) => {
    setFeedbackData(prev => ({
      ...prev,
      [uploadId]: { ...prev[uploadId], [field]: value }
    }));
  };

  const handleSaveFeedback = async (uploadId: string) => {
    const data = feedbackData[uploadId];
    if (!data.status) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie einen Status aus.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Update local state
      setUploads(prev => prev.map(upload => 
        upload.id === uploadId 
          ? { ...upload, status: data.status as 'pending' | 'approved' | 'rejected', feedback: data.feedbackText }
          : upload
      ));
      
      setExpandedId(null);
      
      toast({
        title: "Feedback gespeichert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Fehler",
        description: "Fehler beim Speichern, bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-pink-500';
      case 'pending': return 'bg-gray-400';
      case 'rejected': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #E03A3E, #C91A1F)' }}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img 
              src="/lovable-uploads/d8f0bf8e-1d1b-4046-bdfb-33bd1b356167.png" 
              alt="NBA-Plattform Logo" 
              className="w-8 h-8"
            />
            <h1 className="text-xl font-semibold text-gray-800">NBA-Plattform</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <span className="text-gray-700 text-sm font-medium">{userEmail}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-800"
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Aktuelle Uploads</h2>
          <p className="text-gray-600 mb-6">
            Unten siehst du alle Dateien, die Publisher hochgeladen haben. Bearbeite hier deine Felder (magenta markiert) und ändere den Status.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Dateiname</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Upload Datum</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Advertiser</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">Download</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map(upload => (
                  <React.Fragment key={upload.id}>
                    <tr className="hover:bg-gray-50 border-b border-gray-100">
                      <td className="px-4 py-3 text-gray-900">{upload.filename}</td>
                      <td className="px-4 py-3 text-center text-gray-900">
                        {new Date(upload.uploaded_at).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{upload.publisher_email}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${getStatusColor(upload.status)}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center items-center space-x-2">
                          <button
                            onClick={() => handleExpand(upload.id)}
                            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                            title="Bearbeiten"
                          >
                            <Edit size={16} className="text-gray-600" />
                          </button>
                          <button
                            onClick={() => window.open(upload.downloadUrl || '#')}
                            className="p-2 hover:bg-gray-200 rounded-full transition-transform hover:scale-110"
                            title="Download"
                          >
                            <Download size={16} className="text-gray-600" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Edit Section */}
                    {expandedId === upload.id && (
                      <tr>
                        <td colSpan={5} className="bg-gray-50 px-4 py-6 border-t border-gray-200">
                          <div className="max-w-2xl space-y-4">
                            {/* Feedback Field */}
                            <div>
                              <label className="block text-sm font-medium text-pink-600 mb-1">
                                Feedback
                              </label>
                              <input
                                type="text"
                                value={feedbackData[upload.id]?.feedbackText || ''}
                                onChange={e => handleChange(upload.id, 'feedbackText', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                                placeholder="Ihr Feedback eingeben..."
                              />
                            </div>

                            {/* Status Dropdown */}
                            <div>
                              <label className="block text-sm font-medium text-pink-600 mb-1">
                                Status in der uppr Performance Platform
                              </label>
                              <select
                                value={feedbackData[upload.id]?.status || ''}
                                onChange={e => handleChange(upload.id, 'status', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                              >
                                <option value="">Wähle Status</option>
                                <option value="pending">offen</option>
                                <option value="approved">ausgeführt</option>
                                <option value="rejected">abgelehnt</option>
                              </select>
                            </div>

                            {/* Extra Feedback Textarea */}
                            <div>
                              <label className="block text-sm font-medium text-pink-600 mb-1">
                                Sonstiges Feedback
                              </label>
                              <textarea
                                rows={3}
                                value={feedbackData[upload.id]?.extraFeedback || ''}
                                onChange={e => handleChange(upload.id, 'extraFeedback', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                                placeholder="Zusätzliches Feedback..."
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end space-x-3 pt-2">
                              <Button
                                variant="outline"
                                onClick={() => setExpandedId(null)}
                                className="border-gray-400 text-gray-700 hover:bg-gray-100"
                              >
                                Abbrechen
                              </Button>
                              <Button
                                onClick={() => handleSaveFeedback(upload.id)}
                                className="bg-pink-600 hover:bg-pink-700 text-white"
                              >
                                Speichern
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvertiserDashboard;
