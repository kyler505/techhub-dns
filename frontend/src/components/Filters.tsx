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
    { label: "Pre-Delivery", value: OrderStatus.PRE_DELIVERY },
    { label: "In Delivery", value: OrderStatus.IN_DELIVERY },
    { label: "Delivered", value: OrderStatus.DELIVERED },
    { label: "Issue", value: OrderStatus.ISSUE },
  ];

  return (
    <div className="mb-4 space-y-4">
      <div className="flex gap-2 border-b">
        {statusTabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => onStatusChange(tab.value)}
            className={`px-4 py-2 border-b-2 -mb-px ${
              status === tab.value
                ? "border-blue-500 text-blue-600 font-medium"
                : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        <input
          type="text"
          placeholder="Search by Order ID, recipient, location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
      </div>
    </div>
  );
}
