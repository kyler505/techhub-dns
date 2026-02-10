import { Outlet } from "react-router-dom";

export default function DeliveryLayout() {
  return (
    <div className="min-w-0">
      <Outlet />
    </div>
  );
}
