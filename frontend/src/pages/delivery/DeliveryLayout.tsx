import { NavLink, Outlet, useLocation } from "react-router-dom";

import { cn } from "../../lib/utils";

const DELIVERY_SECTIONS = [
  {
    to: "/delivery/dispatch",
    label: "Dispatch",
    description: "Prep, queue, and active runs",
  },
  {
    to: "/delivery/fleet",
    label: "Fleet",
    description: "Vehicle availability and checkout",
  },
] as const;

export default function DeliveryLayout() {
  const location = useLocation();
  const inRunDetail = location.pathname.startsWith("/delivery/runs/");

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-1">
          <h1 className="text-lg font-semibold leading-none tracking-tight">Delivery</h1>
          <p className="text-xs text-muted-foreground">Manage dispatch workflow and fleet availability.</p>
        </div>

        <nav aria-label="Delivery sections" className="flex flex-wrap gap-2">
          {DELIVERY_SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md border px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )
              }
            >
              <div className="text-sm font-medium">{section.label}</div>
              <div className="text-xs">{section.description}</div>
            </NavLink>
          ))}
          {inRunDetail ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground">
              <div className="text-sm font-medium text-foreground">Run Details</div>
              <div>Current run in progress</div>
            </div>
          ) : null}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
