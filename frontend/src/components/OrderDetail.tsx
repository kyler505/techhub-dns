import { OrderDetail as OrderDetailType, OrderStatus, AuditLog, TeamsNotification } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";

interface OrderDetailProps {
  order: OrderDetailType;
  auditLogs: AuditLog[];
  notifications: TeamsNotification[];
  onStatusChange: (newStatus: OrderStatus, reason?: string) => void;
  onRetryNotification: () => void;
}

export default function OrderDetail({
  order,
  auditLogs,
  notifications,
  onRetryNotification,
}: OrderDetailProps) {
  const latestNotification = notifications[0];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Order {order.inflow_order_id}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-medium">Status:</label>
            <div className="mt-1">
              <StatusBadge status={order.status} />
            </div>
          </div>
          <div>
            <label className="font-medium">Recipient:</label>
            <p>{order.recipient_name || "N/A"}</p>
          </div>
          <div>
            <label className="font-medium">Contact:</label>
            <p>{order.recipient_contact || "N/A"}</p>
          </div>
          <div>
            <label className="font-medium">Location:</label>
            <p>{order.delivery_location || "N/A"}</p>
          </div>
          <div>
            <label className="font-medium">PO Number:</label>
            <p>{order.po_number || "N/A"}</p>
          </div>
          <div>
            <label className="font-medium">Deliverer:</label>
            <p>{order.assigned_deliverer || "Unassigned"}</p>
          </div>
          {order.issue_reason && (
            <div className="col-span-2">
              <label className="font-medium">Issue Reason:</label>
              <p className="text-red-600">{order.issue_reason}</p>
            </div>
          )}
        </div>
      </div>

      {latestNotification && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Teams Notification</h3>
          <div className="space-y-2">
            <p>
              <strong>Status:</strong>{" "}
              <span
                className={
                  latestNotification.status === "sent"
                    ? "text-green-600"
                    : latestNotification.status === "failed"
                    ? "text-red-600"
                    : "text-yellow-600"
                }
              >
                {latestNotification.status}
              </span>
            </p>
            {latestNotification.sent_at && (
              <p>
                <strong>Sent at:</strong>{" "}
                {formatToCentralTime(latestNotification.sent_at)}
              </p>
            )}
            {latestNotification.error_message && (
              <div>
                <p className="text-red-600">
                  <strong>Error:</strong> {latestNotification.error_message}
                </p>
                <button
                  onClick={onRetryNotification}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Retry Notification
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4">Audit Timeline</h3>
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div key={log.id} className="border-l-2 border-gray-300 pl-4 py-2">
              <p className="font-medium">
                {log.from_status || "Created"} → {log.to_status}
              </p>
              <p className="text-sm text-gray-600">
                {formatToCentralTime(log.timestamp)}
                {log.changed_by && ` by ${log.changed_by}`}
              </p>
              {log.reason && <p className="text-sm text-gray-500 mt-1">{log.reason}</p>}
            </div>
          ))}
        </div>
      </div>

      {order.inflow_data && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Inflow Data</h3>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(order.inflow_data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
