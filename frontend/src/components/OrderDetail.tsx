import { Link } from "react-router-dom";
import { OrderDetail as OrderDetailType, OrderStatus, AuditLog, TeamsNotification } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";

interface OrderDetailProps {
    order: OrderDetailType;
    auditLogs: AuditLog[];
    notifications: TeamsNotification[];
    onStatusChange: (newStatus: OrderStatus, reason?: string) => void;
    onRetryNotification: () => void;
    onTagOrder: (tagIds: string[]) => void;
    onGeneratePicklist: () => void;
}

export default function OrderDetail({
    order,
    auditLogs,
    notifications,
    onRetryNotification,
    onTagOrder,
    onGeneratePicklist,
}: OrderDetailProps) {
    const latestNotification = notifications[0];

    const handleTagging = () => {
        const raw = window.prompt("Enter tag IDs (comma-separated)", "");
        if (raw === null) return;
        const tagIds = raw
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        onTagOrder(tagIds);
    };

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
                        {order.inflow_data?.shippingAddress && (
                            <p className="text-sm text-gray-500 mt-1">
                                {[
                                    order.inflow_data.shippingAddress.address1,
                                    order.inflow_data.shippingAddress.address2,
                                    order.inflow_data.shippingAddress.city,
                                    order.inflow_data.shippingAddress.state,
                                    order.inflow_data.shippingAddress.postalCode
                                ].filter(Boolean).join(", ")}
                            </p>
                        )}
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
                {order.status === OrderStatus.IN_DELIVERY && (
                    <div className="mt-4">
                        <Link
                            to={`/document-signing?orderId=${order.id}`}
                            className="inline-flex items-center px-4 py-2 bg-[#800000] text-white rounded hover:bg-[#660000]"
                        >
                            Open Document Signing
                        </Link>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4">Preparation Checklist</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-medium">Asset Tagging</p>
                            <p className="text-sm text-gray-600">
                                {order.tagged_at
                                    ? `Completed ${formatToCentralTime(order.tagged_at)}`
                                    : "Pending"}
                            </p>
                        </div>
                        <button
                            onClick={handleTagging}
                            disabled={Boolean(order.tagged_at)}
                            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                        >
                            {order.tagged_at ? "Tagged" : "Mark Tagged"}
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-medium">Generate Picklist & Email Order Details</p>
                            <p className="text-sm text-gray-600">
                                {order.picklist_generated_at
                                    ? `Generated ${formatToCentralTime(order.picklist_generated_at)}`
                                    : "Pending"}
                            </p>
                            {order.picklist_generated_at && (
                                <p className="text-xs text-green-600">✓ Order Details emailed to recipient</p>
                            )}
                            {order.picklist_path && (
                                <a
                                    className="text-sm text-blue-600 hover:underline"
                                    href={`/api/orders/${order.id}/picklist`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Download picklist
                                </a>
                            )}
                        </div>
                        <button
                            onClick={onGeneratePicklist}
                            disabled={!order.tagged_at || Boolean(order.picklist_generated_at)}
                            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                        >
                            {order.picklist_generated_at ? "Generated" : "Generate & Email"}
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-medium">QA Checklist</p>
                            <p className="text-sm text-gray-600">
                                {order.qa_completed_at
                                    ? `Completed ${formatToCentralTime(order.qa_completed_at)}${order.qa_completed_by ? ` by ${order.qa_completed_by}` : ''}`
                                    : "Pending"}
                            </p>
                            {order.qa_method && (
                                <p className="text-xs text-gray-500">Method: {order.qa_method}</p>
                            )}
                        </div>
                        {order.qa_completed_at ? (
                            <span className="px-3 py-2 text-sm bg-green-100 text-green-800 rounded">
                                QA Completed
                            </span>
                        ) : (
                            <span className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded">
                                QA Pending
                            </span>
                        )}
                    </div>

                </div>
            </div>

            {order.inflow_data?.lines && order.inflow_data.lines.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-xl font-bold mb-4">Order Items</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        #
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Product
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Quantity
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {order.inflow_data.lines.map((line: any, index: number) => (
                                    <tr key={line.productId || index}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            {index + 1}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {line.productName || line.product?.name || line.productId || 'Unknown Product'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                            {line.quantity?.standardQuantity ?? line.quantity ?? 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
