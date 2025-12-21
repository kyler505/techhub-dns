import { OrderStatus } from "../types/order";

interface FiltersProps {
  status: OrderStatus | null;
  onStatusChange: (status: OrderStatus | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export default function Filters({
  status,
  onStatusChange,
  search,
  onSearchChange,
}: FiltersProps) {
  const statusTabs = [
    { label: "All", value: null },
    { label: "Picked", value: OrderStatus.PICKED },
    { label: "Pre-Delivery", value: OrderStatus.PRE_DELIVERY },
    { label: "In Delivery", value: OrderStatus.IN_DELIVERY },
    { label: "Delivered", value: OrderStatus.DELIVERED },
    { label: "Issue", value: OrderStatus.ISSUE },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:justify-between">
      <div className="flex gap-1 border-b">
        {statusTabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => onStatusChange(tab.value)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              status === tab.value
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-full sm:w-auto sm:min-w-[300px]">
        <input
          type="text"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>
    </div>
  );
}
