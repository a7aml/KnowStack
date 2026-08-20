"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { ActivityPoint, ActivityRange } from "@/lib/apiClient";

interface ActivityChartProps {
  points: ActivityPoint[];
  range: ActivityRange;
  onRangeChange: (range: ActivityRange) => void;
  isLoading?: boolean;
}

const RANGE_OPTIONS: { value: ActivityRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function formatTick(dateStr: string, range: ActivityRange): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (range === "90d") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function formatTooltipLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ActivityChart({ points, range, onRangeChange, isLoading }: ActivityChartProps) {
  const hasActivity = points.some((p) => p.count > 0);

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-navy-950">Activity</h2>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onRangeChange(opt.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                opt.value === range
                  ? "bg-navy-950 text-white"
                  : "text-text-muted hover:bg-surface-sunken"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Loading…
          </div>
        ) : !hasActivity ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No activity recorded in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e4e9f0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => formatTick(v, range)}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e4e9f0" }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                labelFormatter={(v) => formatTooltipLabel(String(v))}
                formatter={(value) => [String(value), "Actions"]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4e9f0",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#16213a"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
