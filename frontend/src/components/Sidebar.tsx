import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Tag,
  ClipboardCheck,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import boxTAM from "../../assets/boxTAM.svg";
import { useAuth } from "../contexts/AuthContext";

type LeafNavItem = {
  kind: "leaf";
  path: string;
  to?: string;
  label: string;
  icon: LucideIcon;
};

type GroupNavItem = {
  kind: "group";
  path: string;
  to: string;
  label: string;
  icon: LucideIcon;
  children: Array<{ label: string; to: string }>;
};

const navItems: Array<LeafNavItem | GroupNavItem> = [
  { kind: "leaf", path: "/", label: "Dashboard", icon: LayoutDashboard },
  { kind: "leaf", path: "/orders", label: "Orders", icon: Package },
  { kind: "leaf", path: "/tag-request", label: "Tag Request", icon: Tag },
  { kind: "leaf", path: "/order-qa", label: "QA Checklist", icon: ClipboardCheck },
  {
    kind: "group",
    path: "/delivery",
    to: "/delivery/dispatch",
    label: "Delivery",
    icon: Truck,
    children: [
      { label: "Dispatch", to: "/delivery/dispatch" },
    ],
  },
  { kind: "leaf", path: "/shipping", label: "Shipping", icon: Send },
];

const adminItems = [
  { path: "/admin", label: "Admin", icon: Settings },
  { path: "/sessions", label: "Sessions", icon: Users },
];

export function Sidebar({ className }: { className?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isAdmin } = useAuth();

  const isOnDeliveryRoute = location.pathname.startsWith("/delivery");
  const [deliveryGroupOpen, setDeliveryGroupOpen] = useState(false);

  const visibleAdminItems = isAdmin ? adminItems : adminItems.filter((item) => item.path !== "/admin");

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--sidebar-width", collapsed ? "72px" : "256px");
  }, [collapsed]);

  useEffect(() => {
    if (!isOnDeliveryRoute) {
      setDeliveryGroupOpen(false);
    }
  }, [isOnDeliveryRoute]);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border text-foreground flex flex-col",
        className
      )}
    >
      <div className="flex items-center justify-between h-11 sm:h-12 px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.img
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                src={boxTAM}
                alt="Texas A&M University"
                className="h-8 w-auto"
              />
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="font-semibold text-foreground tracking-tight"
              >
                TechHub
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const active = item.path === "/delivery" ? isOnDeliveryRoute : isActive(item.path);
          const Icon = item.icon;

          if (item.kind === "leaf") {
            return (
              <NavLink
                key={item.path}
                to={item.to ?? item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            );
          }

          const groupOpen = item.path === "/delivery" ? deliveryGroupOpen : false;
          const showChildren = !collapsed && groupOpen;

          return (
            <div key={item.path} className="space-y-1">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <NavLink
                 to={item.to}
                  className="flex min-w-0 flex-1 items-center gap-3"
                  onClick={() => {
                    if (item.path === "/delivery") {
                      setDeliveryGroupOpen(true);
                    }
                  }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>

                {!collapsed && item.path === "/delivery" && (
                  <button
                    type="button"
                    aria-label={deliveryGroupOpen ? "Collapse Delivery" : "Expand Delivery"}
                    onClick={() => setDeliveryGroupOpen((v) => !v)}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      active
                        ? "text-accent-foreground/80 hover:text-accent-foreground hover:bg-accent-foreground/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        deliveryGroupOpen ? "rotate-90" : "rotate-0"
                      )}
                    />
                  </button>
                )}
              </div>

              <AnimatePresence initial={false}>
                {showChildren && item.path === "/delivery" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden pl-6"
                  >
                    <div className="rounded-lg bg-muted/30 border border-border/60 shadow-sm p-1">
                      <div className="space-y-1">
                        {item.children.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={({ isActive: childActive }) =>
                              cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                childActive
                                  ? "bg-accent/70 text-accent-foreground"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              )
                            }
                          >
                            <span className="w-5" />
                            <span className="whitespace-nowrap">{child.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className="my-4 border-t border-border" />

        {visibleAdminItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <NavLink key={item.path} to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.2 }} className="whitespace-nowrap overflow-hidden">
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>
    </motion.aside>
  );
}
