import { Link } from "react-router-dom";
import { useId, useMemo, useState } from "react";
import {
  AuditLog,
  OrderDetail as OrderDetailType,
  OrderStatus,
  TeamsNotification,
} from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
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

interface OrderDetailProps {
  order: OrderDetailType;
  auditLogs: AuditLog[];
  notifications: TeamsNotification[];
  onStatusChange: (newStatus: OrderStatus, reason?: string) => void;
  onRetryNotification: () => void;
  onTagOrder: (tagIds: string[]) => Promise<void>;
  onStartTagRequest: () => Promise<void>;
  onGeneratePicklist: () => void;
}

export default function OrderDetail({
  order,
  auditLogs,
  notifications,
  onRetryNotification,
  onTagOrder,
  onStartTagRequest,
  onGeneratePicklist,
}: OrderDetailProps) {
  const latestNotification = notifications[0];
  const [tagRequestDialogOpen, setTagRequestDialogOpen] = useState(false);
  const [tagPrintedDialogOpen, setTagPrintedDialogOpen] = useState(false);
  const [serialsConfirmed, setSerialsConfirmed] = useState(false);
  const [tagRequesting, setTagRequesting] = useState(false);
  const [tagConfirming, setTagConfirming] = useState(false);

  const assetTagSerials = useMemo(
    () => order.asset_tag_serials || [],
    [order.asset_tag_serials]
  );
  const serialsConfirmedId = useId();

  const tagRequestSentAt = order.tag_data?.tag_request_sent_at;
  const tagRequestStatus = order.tag_data?.tag_request_status;
  const tagRequestSent = Boolean(tagRequestSentAt || tagRequestStatus === "sent");

  const handleTagging = () => {
    setTagRequestDialogOpen(true);
  };

  const resetTagDialog = () => {
    setSerialsConfirmed(false);
  };

  const handleTagDialogOpenChange = (open: boolean) => {
    setTagRequestDialogOpen(open);
    if (!open) {
      resetTagDialog();
    }
  };

  const handleTagRequestSubmit = async () => {
    setTagRequesting(true);
    try {
      await onStartTagRequest();
      handleTagDialogOpenChange(false);
      setTagPrintedDialogOpen(true);
    } catch (error) {
      console.error("Failed to send tag request:", error);
      toast.error("Failed to send tag request");
    } finally {
      setTagRequesting(false);
    }
  };

  const handleTagPrintedConfirm = async () => {
    setTagConfirming(true);
    try {
      await onTagOrder([]);
      setTagPrintedDialogOpen(false);
    } catch (error) {
      console.error("Failed to confirm tagging:", error);
      toast.error("Failed to confirm tags printed");
    } finally {
      setTagConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Order {order.inflow_order_id}</CardTitle>
        </CardHeader>
        <CardContent>
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
              {order.inflow_data?.shippingAddress && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    order.inflow_data.shippingAddress.address1,
                    order.inflow_data.shippingAddress.address2,
                    order.inflow_data.shippingAddress.city,
                    order.inflow_data.shippingAddress.state,
                    order.inflow_data.shippingAddress.postalCode,
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
            <div className="mt-6">
              <Button asChild variant="destructive">
                <Link to={`/document-signing?orderId=${order.id}`}>
                  Open Document Signing
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Preparation Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Asset Tagging</p>
                <p className="text-sm text-muted-foreground">
                  {order.tagged_at
                    ? `Completed ${formatToCentralTime(order.tagged_at)}`
                    : tagRequestSentAt
                      ? `Requested ${formatToCentralTime(tagRequestSentAt)}`
                      : "Pending"}
                </p>
                {tagRequestSent && !order.tagged_at && (
                  <p className="text-xs text-muted-foreground">
                    Tag request sent. Waiting on printed tags.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleTagging}
                  disabled={Boolean(order.tagged_at) || tagRequestSent}
                  size="sm"
                >
                  {order.tagged_at
                    ? "Tagged"
                    : tagRequestSent
                      ? "Request Sent"
                      : "Request Tags"}
                </Button>
                {!order.tagged_at && tagRequestSent && (
                  <Button
                    onClick={() => setTagPrintedDialogOpen(true)}
                    variant="secondary"
                    size="sm"
                  >
                    Confirm Tags Printed
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
                disabled={!order.tagged_at || Boolean(order.picklist_generated_at)}
                size="sm"
              >
                {order.picklist_generated_at ? "Generated" : "Generate & Email"}
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
              <Badge variant={order.qa_completed_at ? "success" : "secondary"}>
                {order.qa_completed_at ? "QA Completed" : "QA Pending"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {order.inflow_data?.lines && order.inflow_data.lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.inflow_data.lines.map((line: any, index: number) => (
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
                      <TableCell className="text-right">
                        {Math.floor(
                          Number(
                            line.quantity?.standardQuantity ?? line.quantity ?? 0
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {latestNotification && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Teams Notification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
                  <Button onClick={onRetryNotification} className="mt-2" size="sm">
                    Retry Notification
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Audit Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="border-l-2 border-border pl-4 py-2">
                <p className="text-sm font-medium text-foreground">
                  {log.from_status || "Created"} → {log.to_status}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatToCentralTime(log.timestamp)}
                  {log.changed_by && ` by ${log.changed_by}`}
                </p>
                {log.reason && (
                  <p className="mt-1 text-sm text-muted-foreground">{log.reason}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {order.inflow_data && (
        <Card>
          <details className="group">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <CardHeader className="relative pr-10">
                <CardTitle className="text-xl">Inflow Data</CardTitle>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform group-open:rotate-180" />
              </CardHeader>
            </summary>
            <CardContent>
              <pre className="rounded-md bg-muted/50 p-4 overflow-auto text-sm">
                {JSON.stringify(order.inflow_data, null, 2)}
              </pre>
            </CardContent>
          </details>
        </Card>
      )}

      <Dialog open={tagRequestDialogOpen} onOpenChange={handleTagDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Tag Request</DialogTitle>
            <DialogDescription>
              Confirm the serials match the devices in this order before requesting tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                Device Serials
              </div>
              <div className="max-h-56 space-y-3 overflow-y-auto px-4 py-3 text-sm">
                {assetTagSerials.length === 0 ? (
                  <p className="text-muted-foreground">
                    No laptop/desktop/AIO serials were found from inflow. Verify devices manually.
                  </p>
                ) : (
                  assetTagSerials.map((item) => (
                    <div key={item.product_id || item.product_name}>
                      <p className="font-medium text-foreground">
                        {item.product_name}
                        {item.category_name ? ` (${item.category_name})` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {(item.serials || []).length > 0
                          ? (item.serials || []).join(", ")
                          : "No serials found"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id={serialsConfirmedId}
                checked={serialsConfirmed}
                onChange={(event) => setSerialsConfirmed(event.target.checked)}
                className="mt-1"
              />
              <label
                htmlFor={serialsConfirmedId}
                className="select-none text-sm text-foreground leading-snug"
              >
                Serials match the devices in this order.
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleTagDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleTagRequestSubmit} disabled={!serialsConfirmed || tagRequesting}>
              {tagRequesting ? "Sending..." : "Send Tag Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagPrintedDialogOpen} onOpenChange={setTagPrintedDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tag Request Sent</DialogTitle>
            <DialogDescription>
              Have the tags been printed and applied to the devices?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTagPrintedDialogOpen(false)}>
              Not yet
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
