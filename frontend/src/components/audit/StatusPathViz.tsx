import { useMemo } from "react";

import type { AuditLog } from "../../types/order";

type CanonicalStatus = "PICKED" | "QA" | "PRE_DELIVERY" | "IN_DELIVERY" | "SHIPPING" | "DELIVERED" | "ISSUE";

const CANONICAL_STEPS: CanonicalStatus[] = ["PICKED", "QA", "PRE_DELIVERY", "IN_DELIVERY", "SHIPPING", "DELIVERED", "ISSUE"];

const toCanonicalStatus = (value: string | null | undefined): CanonicalStatus | null => {
  const v = (value || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "picked") return "PICKED";
  if (v === "qa") return "QA";
  if (v === "pre-delivery" || v === "pre_delivery" || v === "pre delivery") return "PRE_DELIVERY";
  if (v === "in-delivery" || v === "in_delivery" || v === "in delivery") return "IN_DELIVERY";
  if (v === "shipping") return "SHIPPING";
  if (v === "delivered") return "DELIVERED";
  if (v === "issue") return "ISSUE";
  return null;
};

const toMillis = (dateLike: string) => {
  const ms = new Date(dateLike).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours <= 0) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
};

type StatusPathVizProps = {
  auditLogs: AuditLog[];
  title?: string;
};

export default function StatusPathViz({ auditLogs, title = "Status path" }: StatusPathVizProps) {
  const transitions = useMemo(() => {
    const sorted = [...auditLogs].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));
    return sorted
      .map((log) => {
        const from = toCanonicalStatus(log.from_status);
        const to = toCanonicalStatus(log.to_status);
        if (!to) return null;
        return {
          from,
          to,
          atMs: toMillis(log.timestamp),
        };
      })
      .filter(Boolean) as Array<{ from: CanonicalStatus | null; to: CanonicalStatus; atMs: number }>;
  }, [auditLogs]);

  const reached = useMemo(() => {
    const set = new Set<CanonicalStatus>();
    for (const t of transitions) {
      if (t.from) set.add(t.from);
      set.add(t.to);
    }
    return set;
  }, [transitions]);

  const durationsByToStatus = useMemo(() => {
    const map = new Map<CanonicalStatus, number>();
    for (let i = 1; i < transitions.length; i++) {
      const prev = transitions[i - 1];
      const curr = transitions[i];
      map.set(curr.to, Math.max(0, curr.atMs - prev.atMs));
    }
    return map;
  }, [transitions]);

  const nodeCount = CANONICAL_STEPS.length;
  const w = 660;
  const h = 90;
  const padX = 24;
  const y = 34;
  const stepX = (w - padX * 2) / (nodeCount - 1);

  return (
    <div className="rounded-lg border border-maroon-900/10 bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <svg className="mt-2 w-full" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Order status path">
        {CANONICAL_STEPS.map((step, idx) => {
          const x = padX + idx * stepX;
          const active = reached.has(step);
          const isIssue = step === "ISSUE";
          const fill = active ? (isIssue ? "hsl(var(--destructive))" : "hsl(var(--primary))") : "hsl(var(--muted))";
          const stroke = active ? (isIssue ? "hsl(var(--destructive))" : "hsl(var(--primary))") : "hsl(var(--border))";

          const duration = durationsByToStatus.get(step);
          return (
            <g key={step}>
              {idx > 0 ? (
                <line
                  x1={padX + (idx - 1) * stepX}
                  y1={y}
                  x2={x}
                  y2={y}
                  stroke={active ? "hsl(var(--primary))" : "hsl(var(--border))"}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={active ? 0.95 : 0.6}
                />
              ) : null}
              <circle cx={x} cy={y} r={10} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={x} y={68} textAnchor="middle" fontSize={11} fill="currentColor" className="text-foreground">
                {step.replace("_", " ")}
              </text>
              {duration != null ? (
                <text x={x} y={84} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted-foreground">
                  {formatDuration(duration)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
