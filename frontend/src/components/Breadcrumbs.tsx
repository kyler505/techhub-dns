import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  "": "Dashboard",
  orders: "Orders",
  "order-qa": "QA Checklist",
  delivery: "Delivery",
  shipping: "Shipping",
  admin: "Admin",
  sessions: "Sessions",
  runs: "Runs",
  qa: "QA",
};

function formatSegment(segment: string) {
  return LABELS[segment] ?? segment.replace(/-/g, " ");
}

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = segments.map((segment, index) => {
    const path = "/" + segments.slice(0, index + 1).join("/");
    const isId = /^[0-9a-f-]{8,}$/.test(segment);
    const label = isId ? "Details" : formatSegment(segment);
    return { path, label, isId };
  });

  return (
    <div className="flex items-center text-xs text-muted-foreground">
      <Link to="/" className="hover:text-foreground transition-colors">
        Dashboard
      </Link>
      {crumbs.map((crumb) => (
        <div key={crumb.path} className="flex items-center">
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-muted-foreground/70" />
          {crumb.isId ? (
            <span className="text-foreground">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
