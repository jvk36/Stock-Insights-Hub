import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Member = { clerkUserId: string; email: string; role: string; plan?: string; subscriptionStatus?: string; currentPeriodEnd?: string; createdAt: string; deletionStartedAt?: string; hasBillingAccount: boolean; deletable: boolean };
type DeleteResponse = { error?: string; deleted?: boolean; billingCleanup?: "deleted" | "not_required" };

async function readDeleteResponse(response: Response): Promise<DeleteResponse> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as DeleteResponse;
  } catch {
    return {};
  }
}

function fallbackDeleteError(status: number) {
  if (status === 401) return "Your session expired. Sign in again and retry.";
  if (status === 403) return "Administrator access is required to delete users.";
  if (status === 404) return "This user no longer exists. Refresh the member list.";
  if (status === 503) return "A required account service is unavailable. Please retry shortly.";
  return `Could not delete user (server returned ${status}). Please retry.`;
}

export default function AdminMembers() {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string>();
  const query = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const r = await fetch("/api/membership/admin/users", { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 403 ? "Administrator access required" : "Could not load members");
      return r.json() as Promise<{ users: Member[] }>;
    },
  });
  async function deleteMember(user: Member) {
    setDeletingId(user.clerkUserId);
    try {
      const response = await fetch(`/api/membership/admin/users/${encodeURIComponent(user.clerkUserId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: user.email }),
      });
      const payload = await readDeleteResponse(response);
      if (!response.ok) throw new Error(payload.error ?? fallbackDeleteError(response.status));
      if (!payload.deleted) throw new Error("The server did not confirm deletion. Refresh the member list before retrying.");
      await query.refetch();
      toast({
        title: "User deleted",
        description: payload.billingCleanup === "deleted"
          ? `${user.email} was removed from sign-in, the app, and Stripe billing.`
          : `${user.email} was removed from sign-in and the app. No billing account was attached.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "User was not deleted",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDeletingId(undefined);
    }
  }
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <main className="mx-auto max-w-6xl">
        <Link href="/account" className="text-sm font-medium text-primary">← Account</Link>
        <h1 className="mt-5 text-3xl font-bold">Members</h1>
        <p className="mt-1 text-muted-foreground">Identity, role, and last known billing entitlement.</p>
        {query.isLoading && <p className="mt-8 text-muted-foreground">Loading members…</p>}
        {query.error && <p className="mt-8 text-destructive">{query.error.message}</p>}
        {query.data && <div className="mt-7 overflow-x-auto rounded-xl border bg-card"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40"><tr>{["Email","Role","Plan","Status","Paid through","Joined","Actions"].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{query.data.users.map(u => <tr key={u.clerkUserId} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{u.email}</td><td className="px-4 py-3 capitalize">{u.role}</td><td className="px-4 py-3 capitalize">{u.plan ?? "—"}</td><td className="px-4 py-3 capitalize">{u.deletionStartedAt ? "Deletion pending" : u.subscriptionStatus ?? "—"}</td><td className="px-4 py-3">{u.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleDateString() : "—"}</td><td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td><td className="px-4 py-3">{u.deletable ? <AlertDialog><AlertDialogTrigger asChild><button disabled={!!deletingId} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{deletingId === u.clerkUserId ? "Deleting…" : u.deletionStartedAt ? "Retry deletion" : "Delete"}</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {u.email}?</AlertDialogTitle><AlertDialogDescription>{u.hasBillingAccount ? "This permanently removes the user. Their Stripe billing account and subscriptions must be removed first, followed by their sign-in account and local membership. If Stripe is unavailable, deletion stays pending so you can retry safely." : "This permanently removes the user’s sign-in account and local membership. No billing account is attached to this member."} This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep user</AlertDialogCancel><AlertDialogAction onClick={() => void deleteMember(u)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete user</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : <span className="text-xs text-muted-foreground">Current admin</span>}</td></tr>)}</tbody></table></div>}
      </main>
    </div>
  );
}