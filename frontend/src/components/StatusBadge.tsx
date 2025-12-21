import { OrderStatus } from "../types/order";
import { Badge } from "./ui/badge";

interface StatusBadgeProps {
  status: OrderStatus;
}

const statusVariants: Record<OrderStatus, "default" | "secondary" | "destructive" | "success" | "warning" | "outline"> = {
  [OrderStatus.PICKED]: "secondary",
  [OrderStatus.PRE_DELIVERY]: "default",
  [OrderStatus.IN_DELIVERY]: "warning",
  [OrderStatus.SHIPPING]: "outline",
  [OrderStatus.DELIVERED]: "success",
  [OrderStatus.ISSUE]: "destructive",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]}>
      {status}
    </Badge>
  );
}
