import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import Papa from "papaparse";
import {
  Users,
  Search,
  Filter,
  MoreVertical,
  Download,
  Upload as UploadIcon,
  Mail,
  Phone,
  Building2,
  Trash2,
  UserPlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/dashboard/contacts/")({
  component: ContactsIndex,
});

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

function ContactsIndex() {
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", company: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, company")
        .order("last_name", { ascending: true, nullsFirst: false });
      if (searchQuery) {
        query = query.or(
          `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as ContactRow[];
    },
  });

  const resolveWorkspace = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_workspace_id")
      .single();
    const workspaceId = profile?.default_workspace_id;
    if (!workspaceId) throw new Error("No workspace found");
    return { userId: user.id, workspaceId };
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const { userId, workspaceId } = await resolveWorkspace();
      const { error } = await supabase.from("contacts").insert({
        workspace_id: workspaceId,
        created_by: userId,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact added");
      setForm({ first_name: "", last_name: "", email: "", phone: "", company: "" });
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const { userId, workspaceId } = await resolveWorkspace();
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      });
      const rows = parsed.data
        .map((r) => ({
          workspace_id: workspaceId,
          created_by: userId,
          first_name: r.first_name || r.firstname || r.given_name || null,
          last_name: r.last_name || r.lastname || r.family_name || null,
          email: r.email || r.email_address || null,
          phone: r.phone || r.phone_number || r.mobile || null,
          company: r.company || r.organization || null,
        }))
        .filter((r) => r.first_name || r.last_name || r.email);
      if (rows.length === 0) throw new Error("No valid rows found in CSV");
      // Batch insert to avoid payload limits
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const { error } = await supabase.from("contacts").insert(slice);
        if (error) throw error;
        inserted += slice.length;
      }
      return inserted;
    },
    onSuccess: (n) => {
      toast.success(`Imported ${n} contacts`);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(`Import failed: ${e.message}`),
  });

  const handleExport = async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("first_name, last_name, email, phone, company");
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("No contacts to export");
      return;
    }
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} contacts`);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMutation.mutate(file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-slate-500">Manage your customers and subscribers.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadIcon className="mr-2 h-4 w-4" />
            )}
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Create a new contact in your workspace.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fn">First name</Label>
                <Input id="fn" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ln">Last name</Label>
                <Input id="ln" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ph">Phone</Label>
              <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="co">Company</Label>
              <Input id="co" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || (!form.first_name && !form.last_name && !form.email)}
            >
              {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : contacts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium">No contacts found</h3>
          <p className="mt-1 text-slate-500">Start building your audience by adding contacts.</p>
          <Button variant="outline" className="mt-6" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add First Contact
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts?.map((contact) => (
                <TableRow key={contact.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                          {contact.first_name?.[0]}
                          {contact.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {contact.first_name} {contact.last_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Building2 className="h-3.5 w-3.5" />
                      {contact.company || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="h-3.5 w-3.5" />
                      {contact.email || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="h-3.5 w-3.5" />
                      {contact.phone || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit Contact</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => deleteMutation.mutate(contact.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
