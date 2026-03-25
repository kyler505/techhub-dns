import { useEffect, useRef, useState } from "react";
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
  FilePenLine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import boxTAM from "../../assets/boxTAM.svg";
import { useAuth } from "../contexts/AuthContext";

type LeafNavItem = {
  path: string;
  to?: string;
  label: string;
  icon: LucideIcon;
};

const navItems: LeafNavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/orders", label: "Orders", icon: Package },
  { path: "/tag-request", label: "Tag Request", icon: Tag },
  { path: "/order-qa", label: "QA Checklist", icon: ClipboardCheck },
  { path: "/delivery", to: "/delivery/dispatch", label: "Delivery", icon: Truck },
  { path: "/shipping", label: "Shipping", icon: Send },
];

const adminItems = [
  { path: "/admin", label: "Admin", icon: Settings },
  { path: "/sessions", label: "Sessions", icon: Users },
];

export function Sidebar({ className }: { className?: string }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  const location = useLocation();
  const { isAdmin } = useAuth();
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const visibleAdminItems = isAdmin
    ? adminItems
    : adminItems.filter((item) => item.path !== "/admin" && item.path !== "/vetting-editor");

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--sidebar-width", isMobile ? "0px" : collapsed ? "72px" : "256px");
  }, [collapsed, isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncCollapsed = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobile(event.matches);
      setCollapsed(event.matches);
      setIsMobileOpen(false);
    };

    syncCollapsed(mediaQuery);
    mediaQuery.addEventListener("change", syncCollapsed);
    return () => mediaQuery.removeEventListener("change", syncCollapsed);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const onTouchStart = (event: TouchEvent) => {
      touchStartXRef.current = event.touches[0]?.clientX ?? null;
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const onTouchEnd = (event: TouchEvent) => {
      const startX = touchStartXRef.current;
      const startY = touchStartYRef.current;
      const endX = event.changedTouches[0]?.clientX;
      const endY = event.changedTouches[0]?.clientY;

      touchStartXRef.current = null;
      touchStartYRef.current = null;

      if (startX === null || startY === null || typeof endX !== "number" || typeof endY !== "number") {
        return;
      }

      const deltaX = endX - startX;
      const deltaY = Math.abs(endY - startY);
      if (deltaY > 80) {
        return;
      }

      if (!isMobileOpen && startX < 24 && deltaX > 48) {
        setIsMobileOpen(true);
      }

      if (isMobileOpen && deltaX < -48) {
        setIsMobileOpen(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, isMobileOpen]);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <>
      {isMobile && isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-[1px] touch-manipulation"
        />
      )}
      {isMobile && !isMobileOpen && (
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={() => setIsMobileOpen(true)}
          className="fixed left-3 top-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg touch-manipulation"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      <motion.aside
        initial={false}
        animate={isMobile ? { x: isMobileOpen ? 0 : -288 } : { width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "fixed left-0 top-0 z-50 h-screen bg-card border-r border-border text-foreground flex flex-col will-change-transform",
          isMobile ? "w-[288px] max-w-[calc(100vw-3rem)] shadow-2xl" : "",
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
                className="font-semibold text-foreground tracking-tight leading-tight"
              >
                TechHub
                <br />
                Super App
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isMobile) {
              setIsMobileOpen((current) => !current);
              return;
            }
            setCollapsed(!collapsed);
          }}
          aria-label={isMobile ? (isMobileOpen ? "Close sidebar" : "Open sidebar") : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={isMobile ? isMobileOpen : !collapsed}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground touch-manipulation"
        >
          {isMobile ? (
            isMobileOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
          ) : collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto custom-scrollbar touch-pan-y">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.to ?? item.path}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
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
        })}

        <div className="my-4 border-t border-border" />

        {/* Vetting Editor item - positioned after separator but before other admin items */}
        {isAdmin && (
          <NavLink
            key="/vetting-editor"
            to="/vetting-editor"
            aria-label={collapsed ? "Vetting Editor" : undefined}
            title={collapsed ? "Vetting Editor" : undefined}
            className={({ isActive }) =>
              cn(
                "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )
            }
          >
            <FilePenLine className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Vetting Editor
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        )}

        {visibleAdminItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <NavLink key={item.path} to={item.path}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
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
    </>
  );
}
