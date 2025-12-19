import { OrderStatus } from "../types/order";

interface StatusBadgeProps {
  status: OrderStatus;
}

const statusColors: Record<OrderStatus, string> = {
  [OrderStatus.PICKED]: "bg-slate-500",
  [OrderStatus.PRE_DELIVERY]: "bg-blue-500",
  [OrderStatus.IN_DELIVERY]: "bg-orange-500",
  [OrderStatus.DELIVERED]: "bg-green-500",
  [OrderStatus.ISSUE]: "bg-red-500",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-white text-sm font-medium ${statusColors[status]}`}
    >
      {status}
    </span>
  );
}
