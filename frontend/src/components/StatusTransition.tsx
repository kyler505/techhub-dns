import { useState } from "react";
import { OrderStatus } from "../types/order";

interface StatusTransitionProps {
  currentStatus: OrderStatus;
  newStatus: OrderStatus;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  requireReason?: boolean;
}

export default function StatusTransition({
  currentStatus,
  newStatus,
  onConfirm,
  onCancel,
  requireReason = false,
}: StatusTransitionProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      alert("Reason is required");
      return;
    }
    onConfirm(reason || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Change Status</h2>
        <p className="mb-4">
          Change status from <strong>{currentStatus}</strong> to <strong>{newStatus}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          {requireReason && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Reason *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border rounded p-2"
                rows={3}
                required
                placeholder="Enter reason for this status change..."
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
