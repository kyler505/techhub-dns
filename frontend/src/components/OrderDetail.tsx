import { Link } from "react-router-dom";
import { useState } from "react";
import {
  AuditLog,
  OrderDetail as OrderDetailType,
  OrderStatus,
  TeamsNotification,
} from "../types/order";

interface ShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

function getShippingAddress(order: OrderDetailType): ShippingAddress | null {
  if (!order.inflow_data || typeof order.inflow_data !== "object") return null;
  const addr = (order.inflow_data as Record<string, unknown>).shippingAddress;
  return typeof addr === "object" && addr !== null ? addr as ShippingAddress : null;
}

function getInflowLines(order: OrderDetailType): unknown[] {
  if (!order.inflow_data || typeof order.inflow_data !== "object") return [];
  const lines = (order.inflow_data as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines : [];
}
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { toast } from "sonner";
import StatusPathViz from "./audit/StatusPathViz";

interface OrderDetailProps {
  order: OrderDetailType;
  auditLogs: AuditLog[];
  notifications: TeamsNotification[];
  onStatusChange: (newStatus: OrderStatus, reason?: string) => void;
  onTagOrder: (tagIds: string[]) => Promise<void>;
  onRequestTags: () => Promise<void>;
  onGeneratePicklist: () => Promise<void>;
  generatingPicklist: boolean;
}

type OrderItemLine = {
  productId?: string;
  productName?: string;
  description?: string;
  product?: {
    name?: string;
  };
  quantity?: {
    standardQuantity?: number | string;
    serialNumbers?: Array<string | number>;
  } | number | string;
};

const getLineQuantity = (line: OrderItemLine): number => {
  const rawQuantity =
    typeof line.quantity === "object" && line.quantity !== null
      ? line.quantity.standardQuantity
      : line.quantity;

  return Math.floor(Number(rawQuantity ?? 0));
};

const getLineSerials = (line: OrderItemLine): string[] => {
  if (typeof line.quantity !== "object" || line.quantity === null) {
    return [];
  }

  return (line.quantity.serialNumbers ?? []).map((serial) => String(serial));
};
export default function OrderDetail({
  order,
  auditLogs,
  notifications,
  onTagOrder,
  onRequestTags,
  onGeneratePicklist,
  generatingPicklist,
}: OrderDetailProps) {
  const latestNotification = notifications[0];
  const [tagPrintedDialogOpen, setTagPrintedDialogOpen] = useState(false);
  const [tagConfirming, setTagConfirming] = useState(false);
  const [requestTagsConfirmOpen, setRequestTagsConfirmOpen] = useState(false);
  const [requestingTags, setRequestingTags] = useState(false);

  const assetTagRequired = order.asset_tag_required !== false;

  const requestSentAt =
    order.tag_data?.canopyorders_request_sent_at || order.tag_data?.tag_request_sent_at;
  const requestSentBy = order.tag_data?.canopyorders_request_sent_by;
  const requestSent = Boolean(requestSentAt || order.tag_data?.tag_request_status === "sent");

  const canRequestTags =
    assetTagRequired &&
    order.status === OrderStatus.PICKED &&
    !order.tagged_at &&
    !requestSent &&
    Boolean(order.inflow_order_id);

  const handleRequestTags = async (): Promise<boolean> => {
    if (!canRequestTags) return false;

    setRequestingTags(true);
    try {
      await onRequestTags();
      return true;
    } catch (error) {
      toast.error("Failed to request tags");
      return false;
    } finally {
      setRequestingTags(false);
    }
  };

  const handleRequestTagsConfirm = async () => {
    const ok = await handleRequestTags();
    if (ok) setRequestTagsConfirmOpen(false);
  };

  const handleTagPrintedConfirm = async () => {
    setTagConfirming(true);
    try {
      await onTagOrder([]);
      setTagPrintedDialogOpen(false);
    } catch (error) {
      toast.error("Failed to confirm tags printed");
    } finally {
      setTagConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold tracking-tight">Order {order.inflow_order_id}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={order.status} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Recipient</p>
              <p className="text-sm text-foreground">{order.recipient_name || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contact</p>
              <p className="text-sm text-foreground">
                {order.recipient_contact || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Location</p>
              <p className="text-sm text-foreground">
                {order.delivery_location || "N/A"}
              </p>
              {getShippingAddress(order) && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    getShippingAddress(order)!.address1,
                    getShippingAddress(order)!.address2,
                    getShippingAddress(order)!.city,
                    getShippingAddress(order)!.state,
                    getShippingAddress(order)!.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">PO Number</p>
              <p className="text-sm text-foreground">{order.po_number || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Deliverer</p>
              <p className="text-sm text-foreground">
                {order.assigned_deliverer || "Unassigned"}
              </p>
            </div>
            {order.issue_reason && (
              <div className="sm:col-span-2">
                <p className="text-sm font-medium text-muted-foreground">Issue Reason</p>
                <p className="text-sm text-destructive">{order.issue_reason}</p>
              </div>
            )}
          </div>
          {order.status === OrderStatus.IN_DELIVERY && (
            <div>
              <Button asChild variant="destructive">
                <Link to={`/document-signing?orderId=${order.id}`}>
                  Open Document Signing
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold tracking-tight">Preparation Checklist</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Asset Tagging</p>
                <p className="text-sm text-muted-foreground">
                  {!assetTagRequired
                    ? "Not required"
                    : order.tagged_at
                      ? `Completed ${formatToCentralTime(order.tagged_at)}`
                      : requestSentAt
                        ? `Requested ${formatToCentralTime(requestSentAt)}`
                        : "Pending"}
                </p>
                {assetTagRequired && requestSent && !order.tagged_at && requestSentBy && (
                  <p className="text-xs text-muted-foreground">
                    Requested by {requestSentBy}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {assetTagRequired &&
                  (requestSent ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/tag-request">Open Tag Request</Link>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setRequestTagsConfirmOpen(true)}
                      disabled={!canRequestTags || requestingTags}
                      size="sm"
                    >
                      Request Tags
                    </Button>
                  ))}
                {assetTagRequired && !order.tagged_at && requestSent && (
                  <Button
                    onClick={() => setTagPrintedDialogOpen(true)}
                    variant="secondary"
                    size="sm"
                  >
                    Mark Tagged
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">
                  Generate Picklist & Email Order Details
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.picklist_generated_at
                    ? `Generated ${formatToCentralTime(order.picklist_generated_at)}`
                    : "Pending"}
                </p>
                {order.picklist_generated_at && (
                  <p className="text-xs text-muted-foreground">
                    ✓ Order Details emailed to recipient
                  </p>
                )}
                {order.picklist_path && (
                  <a
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    href={`/api/orders/${order.id}/picklist`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download picklist
                  </a>
                )}
              </div>
              <Button
                onClick={onGeneratePicklist}
                disabled={
                  generatingPicklist ||
                  (assetTagRequired && !order.tagged_at) ||
                  Boolean(order.picklist_generated_at)
                }
                size="sm"
              >
                {order.picklist_generated_at
                  ? "Generated"
                  : generatingPicklist
                    ? "Generating..."
                    : "Generate & Email"}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">QA Checklist</p>
                <p className="text-sm text-muted-foreground">
                  {order.qa_completed_at
                    ? `Completed ${formatToCentralTime(order.qa_completed_at)}${order.qa_completed_by ? ` by ${order.qa_completed_by}` : ""}`
                    : "Pending"}
                </p>
                {order.qa_method && (
                  <p className="text-xs text-muted-foreground">
                    Method: {order.qa_method}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {getInflowLines(order).length > 0 && (
        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
          <h3 className="text-xl font-semibold tracking-tight">Order Items</h3>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Serials</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getInflowLines(order).map((rawLine: unknown, index: number) => {
                    const line = (rawLine ?? {}) as OrderItemLine;
                    const serials = getLineSerials(line);

                    return (
                      <TableRow key={line.productId || index}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {line.productName ||
                            line.product?.name ||
                            line.description ||
                            line.productId ||
                            "Unknown Product"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {serials.length > 0 ? serials.join(", ") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {getLineQuantity(line)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
        </section>
      )}

      {latestNotification && (
        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
          <h3 className="text-xl font-semibold tracking-tight">Teams Notification</h3>
          <div className="mt-4 space-y-2">
              <p className="text-sm text-foreground">
                <span className="font-medium">Status:</span>{" "}
                <Badge
                  variant={
                    latestNotification.status === "sent"
                      ? "success"
                      : latestNotification.status === "failed"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {latestNotification.status}
                </Badge>
              </p>
              {latestNotification.sent_at && (
                <p className="text-sm text-foreground">
                  <span className="font-medium">Sent at:</span>{" "}
                  {formatToCentralTime(latestNotification.sent_at)}
                </p>
              )}
              {latestNotification.error_message && (
                <div>
                  <p className="text-sm text-destructive">
                    <span className="font-medium">Error:</span>{" "}
                    {latestNotification.error_message}
                  </p>
                </div>
              )}
            </div>
        </section>
      )}

      <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
        <h3 className="text-xl font-semibold tracking-tight">Status Path</h3>
          {auditLogs.length > 0 ? (
            <>
              <StatusPathViz auditLogs={auditLogs} title="Workflow path" />
              <div className="max-h-[320px] space-y-2 overflow-auto pr-2">
                {auditLogs
                  .slice()
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((log) => (
                    <div key={log.id} className="rounded-lg border border-maroon-900/10 bg-card p-3">
                      <p className="text-sm font-medium text-foreground">
                        {log.from_status || "Created"} -&gt; {log.to_status}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatToCentralTime(log.timestamp)}
                        {log.changed_by && ` by ${log.changed_by}`}
                      </p>
                      {log.reason ? <p className="mt-1 text-sm text-muted-foreground">{log.reason}</p> : null}
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
              No workflow audit history available.
            </div>
          )}
      </section>

      {order.inflow_data && (
        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
          <details className="group">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="relative pr-10">
                <h3 className="text-xl font-semibold tracking-tight">Inflow Data</h3>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <pre className="mt-4 rounded-md bg-muted/50 p-4 overflow-auto text-sm">
                {JSON.stringify(order.inflow_data, null, 2)}
              </pre>
          </details>
        </section>
      )}

      <Dialog
        open={requestTagsConfirmOpen}
        onOpenChange={(open) => {
          if (requestingTags) return;
          setRequestTagsConfirmOpen(open);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request tags for {order.inflow_order_id}?</DialogTitle>
          </DialogHeader>

          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              <span className="font-medium">Recipient:</span> {order.recipient_name || "N/A"}
            </p>
            <p className="text-foreground">
              <span className="font-medium">Location:</span> {order.delivery_location || "N/A"}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRequestTagsConfirmOpen(false)}
              disabled={requestingTags}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleRequestTagsConfirm()} disabled={requestingTags}>
              {requestingTags ? "Requesting..." : "Request Tags"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagPrintedDialogOpen} onOpenChange={setTagPrintedDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Tagged</DialogTitle>
            <DialogDescription>Confirm the devices have been tagged for this order.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTagPrintedDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTagPrintedConfirm} disabled={tagConfirming}>
              {tagConfirming ? "Confirming..." : "Yes, mark tagged"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
