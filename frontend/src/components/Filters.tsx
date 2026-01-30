import { OrderStatus, OrderStatusDisplayNames } from "../types/order";

// Special filter type that can be a single status, array of statuses, or null (all)
export type StatusFilter = OrderStatus | OrderStatus[] | null;

interface FiltersProps {
    status: StatusFilter;
    onStatusChange: (status: StatusFilter) => void;
    search: string;
    onSearchChange: (search: string) => void;
}

export default function Filters({
    status,
    onStatusChange,
    search,
    onSearchChange,
}: FiltersProps) {
    // Helper to check if current filter matches a tab
    const isActiveTab = (tabValue: StatusFilter) => {
        if (tabValue === null && status === null) return true;
        if (Array.isArray(tabValue) && Array.isArray(status)) {
            return tabValue.length === status.length && tabValue.every(v => status.includes(v));
        }
        return tabValue === status;
    };

    const statusTabs: { label: string; value: StatusFilter }[] = [
        { label: "All", value: null },
        { label: "Picked + QA", value: [OrderStatus.PICKED, OrderStatus.QA] },
        { label: OrderStatusDisplayNames[OrderStatus.PRE_DELIVERY], value: OrderStatus.PRE_DELIVERY },
        { label: OrderStatusDisplayNames[OrderStatus.IN_DELIVERY], value: OrderStatus.IN_DELIVERY },
        { label: OrderStatusDisplayNames[OrderStatus.SHIPPING], value: OrderStatus.SHIPPING },
        { label: OrderStatusDisplayNames[OrderStatus.DELIVERED], value: OrderStatus.DELIVERED },
        { label: OrderStatusDisplayNames[OrderStatus.ISSUE], value: OrderStatus.ISSUE },
    ];

    return (
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:justify-between">
            <div className="flex gap-1 border-b overflow-x-auto whitespace-nowrap ios-scroll no-scrollbar -mx-2 px-2">
                {statusTabs.map((tab) => (
                    <button
                        key={tab.label}
                        onClick={() => onStatusChange(tab.value)}
                        className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors flex-shrink-0 ${isActiveTab(tab.value)
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
