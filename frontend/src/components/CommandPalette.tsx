import { ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  KBarResults,
  useMatches,
  useKBar,
  Action,
} from "kbar";
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  Truck,
  Send,
  Settings,
  Users,
} from "lucide-react";

interface CommandPaletteProviderProps {
  children: ReactNode;
}

function CommandPaletteResults() {
  const { results } = useMatches();

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }: { item: string | Action; active: boolean }) =>
        typeof item === "string" ? (
          <div className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {item}
          </div>
        ) : (
          <div
            className={`flex items-center justify-between px-4 py-3 text-sm rounded-lg cursor-pointer transition-colors ${
              active ? "bg-slate-100 text-slate-900" : "text-slate-600"
            }`}
          >
            <div className="flex items-center gap-3">
              {item.icon && <span className="text-slate-400">{item.icon}</span>}
              <div>
                <div className="font-medium">{item.name}</div>
                {item.subtitle && <div className="text-xs text-slate-500">{item.subtitle}</div>}
              </div>
            </div>
            {item.shortcut?.length ? (
              <div className="flex gap-1">
                {item.shortcut.map((sc: string) => (
                  <kbd
                    key={sc}
                    className="px-1.5 py-0.5 text-xs rounded border border-slate-200 bg-white text-slate-500"
                  >
                    {sc}
                  </kbd>
                ))}
              </div>
            ) : null}
          </div>
        )
      }
    />
  );
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const navigate = useNavigate();

  const actions = useMemo<Action[]>(
    () => [
      {
        id: "dashboard",
        name: "Dashboard",
        shortcut: ["g", "d"],
        keywords: "home overview",
        section: "Navigation",
        perform: () => navigate("/"),
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        id: "orders",
        name: "Orders",
        shortcut: ["g", "o"],
        keywords: "orders queue",
        section: "Navigation",
        perform: () => navigate("/orders"),
        icon: <Package className="h-4 w-4" />,
      },
      {
        id: "qa",
        name: "QA Checklist",
        shortcut: ["g", "q"],
        keywords: "qa checklist",
        section: "Navigation",
        perform: () => navigate("/order-qa"),
        icon: <ClipboardCheck className="h-4 w-4" />,
      },
      {
        id: "delivery",
        name: "Delivery",
        shortcut: ["g", "l"],
        section: "Navigation",
        perform: () => navigate("/delivery"),
        icon: <Truck className="h-4 w-4" />,
      },
      {
        id: "shipping",
        name: "Shipping",
        shortcut: ["g", "s"],
        keywords: "shipping outbound",
        section: "Navigation",
        perform: () => navigate("/shipping"),
        icon: <Send className="h-4 w-4" />,
      },
      {
        id: "admin",
        name: "Admin",
        shortcut: ["g", "a"],
        section: "Admin",
        perform: () => navigate("/admin"),
        icon: <Settings className="h-4 w-4" />,
      },
      {
        id: "sessions",
        name: "Sessions",
        shortcut: ["g", "u"],
        section: "Admin",
        perform: () => navigate("/sessions"),
        icon: <Users className="h-4 w-4" />,
      },
    ],
    [navigate]
  );

  return (
    <KBarProvider actions={actions}>
      {children}
      <KBarPortal>
        <KBarPositioner className="bg-black/20 backdrop-blur-sm z-[60]">
          <KBarAnimator className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <KBarSearch
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Search actions or pages..."
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              <CommandPaletteResults />
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
    </KBarProvider>
  );
}

export function CommandPaletteTrigger() {
  const { query } = useKBar();

  return (
    <button
      type="button"
      onClick={() => query.toggle()}
      className="hidden sm:flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm hover:text-slate-700 hover:border-slate-300 transition-colors"
    >
      <span>Command</span>
      <span className="ml-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
        Cmd + K
      </span>
    </button>
  );
}
