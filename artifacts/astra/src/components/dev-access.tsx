import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  useListDevUsers,
  useAddDevUser,
  useUpdateDevUser,
  useRemoveDevUser,
  getListDevUsersQueryKey,
  type DevUser,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";

export function DevAccess({ ownerEmail }: { ownerEmail: string }) {
  const qc = useQueryClient();
  const { data: devs, isLoading, error } = useListDevUsers();
  const add = useAddDevUser();
  const update = useUpdateDevUser();
  const remove = useRemoveDevUser();
  const [email, setEmail] = useState("");
  const [receiveUpdates, setReceiveUpdates] = useState(true);

  const refresh = () => qc.invalidateQueries({ queryKey: getListDevUsersQueryKey() });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    add.mutate({ data: { email: trimmed, receiveUpdates } }, { onSuccess: () => { setEmail(""); refresh(); } });
  }
  function toggle(dev: DevUser) {
    update.mutate({ id: dev.id, data: { receiveUpdates: !dev.receiveUpdates } }, { onSuccess: refresh });
  }
  function onRemove(dev: DevUser) {
    if (!window.confirm(`Remove dev access for ${dev.email}?`)) return;
    remove.mutate({ id: dev.id }, { onSuccess: refresh });
  }
  const mutationError = add.error ?? update.error ?? remove.error;

  return (
    <div data-testid="block-dev-access">
      <h3 className="text-lg font-semibold text-foreground">Dev access</h3>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        People listed here can send App Tweaks Requests without a subscription. Tick "Update emails" to send them a copy of every new request.
      </p>

      <form onSubmit={onAdd} className="mt-6 flex flex-col gap-3 md:flex-row md:items-center" data-testid="form-add-dev">
        <label htmlFor="dev-email" className="sr-only">Email address</label>
        <input id="dev-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-xl border border-input bg-white px-4 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-testid="input-dev-email" />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={receiveUpdates} onChange={(e) => setReceiveUpdates(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-new-dev-updates" />
          Update emails
        </label>
        <button type="submit" disabled={add.isPending} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-60" data-testid="button-add-dev">
          {add.isPending ? "Adding…" : "Give dev access"}
        </button>
      </form>

      {mutationError && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="text-dev-error">
          {apiErrorMessage(mutationError, "Something went wrong. Please try again.")}
        </p>
      )}

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 text-center font-medium">Update emails</th>
              <th className="px-4 py-3"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-white">
              <td className="break-all px-4 py-3 text-foreground">{ownerEmail} <span className="ml-2 text-xs text-muted-foreground">You</span></td>
              <td className="px-4 py-3 text-center">
                <input type="checkbox" checked disabled aria-label="Owner always receives update emails" className="h-4 w-4" />
              </td>
              <td />
            </tr>
            {isLoading && <tr><td colSpan={3} className="px-4 py-3 text-muted-foreground">Loading…</td></tr>}
            {error && <tr><td colSpan={3} className="px-4 py-3 text-destructive">{apiErrorMessage(error, "Could not load dev list.")}</td></tr>}
            {devs?.map((dev) => (
              <tr key={dev.id} className="bg-white" data-testid={`row-dev-${dev.id}`}>
                <td className="break-all px-4 py-3 text-foreground">{dev.email}</td>
                <td className="px-4 py-3 text-center">
                  <input type="checkbox" checked={dev.receiveUpdates} onChange={() => toggle(dev)} aria-label={`Send update emails to ${dev.email}`} className="h-4 w-4 cursor-pointer" data-testid={`checkbox-dev-updates-${dev.id}`} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onRemove(dev)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove ${dev.email}`} data-testid={`button-remove-dev-${dev.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
