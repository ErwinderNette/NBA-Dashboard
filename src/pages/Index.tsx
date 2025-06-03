
import Header from "@/components/Header";
import UploadArea from "@/components/UploadArea";
import FileList from "@/components/FileList";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 to-blue-500">
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <UploadArea />
        <FileList />
      </div>
    </div>
  );
};

export default Index;
