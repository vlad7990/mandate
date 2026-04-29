"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

// Mandate-flavoured chart wrappers. Each one wraps the shadcn
// ChartContainer with a sensible default config and recharts shapes that
// match the terminal-tone palette. Callers pass plain data arrays and
// optional series colour overrides drawn from globals.css token names.

export type MandateBarDatum = {
  /** X-axis label for vertical bars / Y-axis label for horizontal bars. */
  label: string;
  /** Numeric value for the bar. */
  value: number;
  /**
   * Optional CSS colour string to override the series default. Use this
   * to tone-code categorical buckets (e.g. health: healthy/stalled/at_risk
   * → green/amber/red). Falls back to the chart's series colour when null.
   */
  fill?: string | null;
  /**
   * Pre-formatted display string for the tooltip. When set, the tooltip
   * renders this verbatim instead of the raw value — server components
   * can use it to carry richer hover content (e.g. "5 candidates · 30%")
   * across the server/client boundary as a plain string.
   */
  meta?: string;
};

const DEFAULT_BAR_CONFIG: ChartConfig = {
  value: {
    label: "Count",
    color: "var(--color-primary-container)",
  },
};

/**
 * Horizontal bar chart with categorical y-axis labels — used for funnel
 * stages, health status breakdowns, source distributions. Tokenised
 * against the surface palette: grid uses outline-variant, ticks use
 * outline, bars use primary-container by default.
 *
 * No `formatter` prop: this is a Client Component, and Next.js disallows
 * passing functions across the server/client boundary. Server callers
 * pre-format their tooltip text into each datum's `meta` field instead
 * — strings cross the boundary cleanly.
 */
export function MandateHorizontalBarChart({
  data,
  className,
  valueLabel = "Count",
  defaultFill = "var(--color-primary-container)",
}: {
  data: MandateBarDatum[];
  className?: string;
  valueLabel?: string;
  defaultFill?: string;
}) {
  const config: ChartConfig = React.useMemo(
    () => ({
      value: { label: valueLabel, color: defaultFill },
    }),
    [valueLabel, defaultFill]
  );

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-[260px] w-full", className)}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--color-outline-variant)" />
        <XAxis
          type="number"
          domain={[0, Math.ceil(max * 1.1)]}
          axisLine={false}
          tickLine={false}
          tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
          stroke="var(--color-outline)"
        />
        <YAxis
          type="category"
          dataKey="label"
          axisLine={false}
          tickLine={false}
          width={110}
          tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
          stroke="var(--color-outline)"
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-surface-container-high)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideLabel={false}
              indicator="dot"
              formatter={(rawValue, name, item) => {
                const datum = item.payload as MandateBarDatum;
                return (
                  <span className="font-mono-data text-on-surface tabular-nums">
                    {datum.meta ?? String(rawValue)}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="value" radius={0} fill={defaultFill} isAnimationActive={false}>
          <LabelList
            dataKey="value"
            position="right"
            offset={6}
            className="font-mono-data tabular-nums"
            style={{
              fill: "var(--color-on-surface)",
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
            }}
          />
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill ?? defaultFill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Vertical bar chart with categorical x-axis. Used for things that read
 * left-to-right oldest → newest, like the weekly velocity series.
 */
export function MandateVerticalBarChart({
  data,
  className,
  valueLabel = "Count",
  defaultFill = "var(--color-secondary-fixed-dim)",
  highlightLastBar = true,
  highlightFill = "var(--color-primary-container)",
}: {
  data: MandateBarDatum[];
  className?: string;
  valueLabel?: string;
  defaultFill?: string;
  highlightLastBar?: boolean;
  highlightFill?: string;
}) {
  const config: ChartConfig = React.useMemo(
    () => ({
      value: { label: valueLabel, color: defaultFill },
    }),
    [valueLabel, defaultFill]
  );

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-[200px] w-full", className)}
    >
      <BarChart
        data={data}
        margin={{ top: 16, right: 12, left: 4, bottom: 4 }}
      >
        <CartesianGrid vertical={false} stroke="var(--color-outline-variant)" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
          stroke="var(--color-outline)"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
          stroke="var(--color-outline)"
          allowDecimals={false}
          width={28}
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-surface-container-high)", opacity: 0.4 }}
          content={<ChartTooltipContent hideLabel={false} indicator="dot" />}
        />
        <Bar dataKey="value" radius={0} fill={defaultFill} isAnimationActive={false}>
          <LabelList
            dataKey="value"
            position="top"
            offset={6}
            style={{
              fill: "var(--color-on-surface)",
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 10,
            }}
          />
          {data.map((d, i) => {
            const isLast = i === data.length - 1;
            const fill =
              d.fill ?? (highlightLastBar && isLast ? highlightFill : defaultFill);
            return <Cell key={i} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Tiny line chart for trend overlays — used inside KPI cards or as a
 * compact velocity sparkline. No axes by default; pass `showAxes` to
 * render the full chrome.
 */
export function MandateLineChart({
  data,
  className,
  valueLabel = "Count",
  stroke = "var(--color-primary)",
  showAxes = true,
}: {
  data: MandateBarDatum[];
  className?: string;
  valueLabel?: string;
  stroke?: string;
  showAxes?: boolean;
}) {
  const config: ChartConfig = React.useMemo(
    () => ({
      value: { label: valueLabel, color: stroke },
    }),
    [valueLabel, stroke]
  );

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-[200px] w-full", className)}
    >
      <LineChart
        data={data}
        margin={
          showAxes
            ? { top: 16, right: 12, left: 4, bottom: 4 }
            : { top: 4, right: 4, left: 4, bottom: 4 }
        }
      >
        {showAxes && (
          <CartesianGrid vertical={false} stroke="var(--color-outline-variant)" />
        )}
        {showAxes && (
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
            stroke="var(--color-outline)"
          />
        )}
        {showAxes && (
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 }}
            stroke="var(--color-outline)"
            allowDecimals={false}
            width={28}
          />
        )}
        <ChartTooltip
          cursor={{ stroke: "var(--color-outline-variant)" }}
          content={<ChartTooltipContent hideLabel={false} indicator="line" />}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          dot={{
            r: 3,
            fill: "var(--color-surface)",
            stroke,
            strokeWidth: 2,
          }}
          activeDot={{ r: 5, fill: stroke, stroke: "var(--color-surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export { Cell };

void DEFAULT_BAR_CONFIG; // referenced only as a default constant
