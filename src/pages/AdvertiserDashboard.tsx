
import Header from "@/components/Header";
import AdvertiserFileList from "@/components/AdvertiserFileList";

const AdvertiserDashboard = () => {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e91e63, #ad1457)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <AdvertiserFileList />
      </div>
    </div>
  );
};

export default AdvertiserDashboard;
