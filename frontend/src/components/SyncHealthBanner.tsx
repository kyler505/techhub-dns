import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { systemApi, type SyncHealthResponse } from "../api/system";
import { Button } from "./ui/button";

export function SyncHealthBanner(): JSX.Element | null {
  const [health, setHealth] = useState<SyncHealthResponse | null>(null);

  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const next = await systemApi.getSyncHealth();
        if (cancelled) return;
        setHealth(next);
      } catch {
        // Intentionally no UX here: keep banner hidden to avoid noise.
      } finally {
        inFlightRef.current = false;
      }
    };

    void load();
    const intervalId = window.setInterval(load, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const showBanner = Boolean(health?.inflow.webhook_enabled && health?.inflow.webhook_failed);
  if (!showBanner) return null;

  return (
    <div className="px-6 lg:px-8 pt-4">
      <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Sync delayed</div>
            <div className="text-xs text-muted-foreground mt-1">
              We&apos;re having trouble receiving webhook updates. Data may be stale.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="btn-lift"
          >
            Refresh page
          </Button>
        </div>
      </div>
    </div>
  );
}
