
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";
import CampaignSelector from "@/components/CampaignSelector";

const Dashboard = () => {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #009fe3, #0088cc)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <UploadArea />
        <CampaignSelector />
        <FileList />
      </div>
    </div>
  );
};

export default Dashboard;
