import { NavLink, Outlet } from "react-router-dom";

import { cn } from "../../lib/utils";

function RailLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        )
      }
      end={end}
    >
      {label}
    </NavLink>
  );
}

export default function DeliveryLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px,1fr]">
      <aside className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery</div>
        <nav className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
          <RailLink to="dispatch" label="Dispatch" end />
          <RailLink to="fleet" label="Fleet" />
        </nav>
      </aside>

      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
