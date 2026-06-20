import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  Download,
  PenTool,
  FileText,
  Share2,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoreVertical,
  History,
  FileDigit,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { SignatureManager } from "@/components/signature-manager";

export const Route = createFileRoute("/dashboard/documents/$documentId")({
  component: DocumentDetail,
});

function DocumentDetail() {
  const { documentId } = Route.useParams();
  const [zoom, setZoom] = useState(100);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [placedSignature, setPlacedSignature] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: document, isLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, document_metadata(*)")
        .eq("id", documentId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-12rem)] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-slate-500">Loading document...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-[calc(100vh-12rem)] flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold">Document not found</h2>
        <p className="mt-2 text-slate-500">The document you're looking for doesn't exist or you don't have access.</p>
        <Button className="mt-6" onClick={() => navigate({ to: "/dashboard/documents" })}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col space-y-4">
      {/* Document Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/documents">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="max-w-[300px] truncate text-xl font-bold tracking-tight sm:max-w-md">{document.title}</h1>
            <p className="text-xs text-slate-500">
              {document.file_type?.split('/')[1]?.toUpperCase() ?? 'DOCUMENT'} •
              {(document.file_size / 1024 / 1024).toFixed(2)} MB •
              Status: <span className="font-medium text-primary uppercase">{document.document_status}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Separator orientation="vertical" className="mx-1 hidden h-8 lg:block" />
          <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground shadow-lg hover:bg-primary/90">
                <PenTool className="mr-2 h-4 w-4" />
                Sign Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Your Signature</DialogTitle>
              </DialogHeader>
              <SignatureManager onSave={(url) => {
                setPlacedSignature(url);
                setIsSignModalOpen(false);
                toast.success("Signature created! Now place it on the document.");
              }} />
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <History className="mr-2 h-4 w-4" />
                Version History
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileDigit className="mr-2 h-4 w-4" />
                Convert Format
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(50, z - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(200, z + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-2 h-4" />
          <Button variant="ghost" size="sm">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search in doc..."
              className="h-8 w-40 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <Separator orientation="vertical" className="mx-2 h-4" />
          <span className="text-xs text-slate-500">Page 1 of 1</span>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-8 dark:border-slate-800 dark:bg-slate-950/50">
        <div
          className="relative mx-auto flex aspect-[1/1.414] w-full max-w-3xl flex-col items-center justify-center bg-white shadow-2xl transition-all dark:bg-slate-900"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
        >
          {/* Mock Viewer Content */}
          <div className="flex flex-col items-center gap-4 text-slate-300">
            <FileText className="h-24 w-24" />
            <p className="text-lg font-medium text-slate-400">Previewing {document.title}</p>
            <p className="text-sm text-slate-400">PDF Rendering Engine Ready</p>
          </div>

          {/* Placed Signature (Mock Placement) */}
          {placedSignature && (
            <div className="absolute bottom-[20%] right-[20%] h-20 w-40 cursor-move border border-dashed border-primary bg-primary/5 p-2">
              <img src={placedSignature} alt="Signature" className="h-full w-full object-contain" />
              <div className="absolute -right-2 -top-2 flex gap-1">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-5 w-5 rounded-full"
                  onClick={() => setPlacedSignature(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
