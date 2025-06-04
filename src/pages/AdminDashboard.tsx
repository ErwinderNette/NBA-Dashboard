
import Header from "@/components/Header";
import AdminFileList from "@/components/AdminFileList";

const AdminDashboard = () => {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #6B7280, #4B5563)' }}>
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <AdminFileList />
      </div>
    </div>
  );
};

export default AdminDashboard;
