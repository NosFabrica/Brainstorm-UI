import { Check, Gift, Lock, MessageSquare, Server, X as XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { Chip } from "@/components/ui/chip";
import type { DmMessage } from "@/lib/dm/store";
import { nameOf, relayHost, type Profiles } from "./people";

const when = (at: number) =>
  new Date(at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * What a message looked like on the way: the three NIP-59 layers, what a relay
 * could see of it, and where it was delivered (or seen).
 */
export function MessageDetailsDialog({
  message,
  me,
  profiles,
  onClose,
}: {
  message: DmMessage | null;
  me: string;
  profiles: Profiles;
  onClose: () => void;
}) {
  const mine = message?.author === me;
  const deliveries = message?.outgoing?.deliveries ?? [];
  const byRecipient = new Map<string, typeof deliveries>();
  for (const d of deliveries) byRecipient.set(d.recipient, [...(byRecipient.get(d.recipient) ?? []), d]);
  const status = message?.outgoing?.status;

  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" data-testid="dm-message-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Message details
            {status === "sent" && (
              <Chip tone="success" icon={Check}>
                Delivered
              </Chip>
            )}
            {status === "partial" && <Chip tone="warning">Partly delivered</Chip>}
            {status === "failed" && <Chip tone="danger">Not delivered</Chip>}
          </DialogTitle>
          <DialogDescription>
            Private messages travel in three layers (NIP-17 and NIP-59). Relays only ever see the outer one.
          </DialogDescription>
        </DialogHeader>
        {message && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <SectionHeader kicker="How it travelled" />
              <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Gift className="h-4 w-4" /> Gift wrap
                  <span className="font-mono text-xs font-normal text-slate-500">kind 1059</span>
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Signed by a one-time key and dated up to two days early. Only the recipient's key is visible.
                </p>
                <div className="mt-3 rounded-xl border border-brand-primary/30 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Lock className="h-4 w-4 text-brand-deep" /> Seal
                    <span className="font-mono text-xs font-normal text-slate-500">kind 13</span>
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Signed by {mine ? "you" : nameOf(message.author, profiles)}, encrypted with NIP-44. No tags.
                  </p>
                  <div className="mt-3 rounded-lg bg-brand-primary p-3 text-white">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <MessageSquare className="h-4 w-4" /> Message
                      <span className="font-mono text-xs font-normal opacity-85">kind {message.kind} · unsigned</span>
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm">{message.rumor.content}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SectionHeader kicker="Who saw what" />
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 font-semibold" />
                      <th className="py-1 font-semibold">Relays</th>
                      <th className="py-1 font-semibold">Recipients</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <th scope="row" className="py-2 text-left font-semibold">
                        Sender
                      </th>
                      <td className="py-2 text-slate-500">a random key</td>
                      <td className="py-2">{mine ? "You" : nameOf(message.author, profiles)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2 text-left font-semibold">
                        Sent at
                      </th>
                      <td className="py-2 font-mono text-xs text-slate-500">
                        {message.wrapAt ? when(message.wrapAt) : "—"}
                      </td>
                      <td className="py-2">{when(message.createdAt)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2 text-left font-semibold">
                        Text
                      </th>
                      <td className="py-2 text-slate-500">ciphertext</td>
                      <td className="py-2">the message</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2">
                <SectionHeader kicker={mine && deliveries.length ? "Delivery" : "Seen on"} />
                {mine && deliveries.length ? (
                  [...byRecipient].map(([recipient, list]) => (
                    <div key={recipient} className="flex flex-col gap-1">
                      <span className="text-[13px] font-semibold">
                        {recipient === me ? "Your copy" : `To ${nameOf(recipient, profiles)}`}
                      </span>
                      {list.map((d) => (
                        <span key={d.relay} className="flex items-center gap-2 text-[13px]">
                          <Server className="h-3.5 w-3.5 text-slate-500" />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">{relayHost(d.relay)}</span>
                          {d.ok ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                              <Check className="h-3.5 w-3.5" /> Accepted
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400"
                              title={d.message}
                            >
                              <XIcon className="h-3.5 w-3.5" /> {d.message ? "Refused" : "No answer"}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  ))
                ) : message.relays.length ? (
                  message.relays.map((relay) => (
                    <span key={relay} className="flex items-center gap-2 text-[13px]">
                      <Server className="h-3.5 w-3.5 text-slate-500" />
                      <span className="font-mono text-xs">{relayHost(relay)}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-slate-500">Loaded from this device.</span>
                )}
              </div>

              {message.wrapId && (
                <p className="break-all rounded-xl bg-slate-100 px-3 py-2 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  wrap {message.wrapId}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
