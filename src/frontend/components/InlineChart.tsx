import { useMemo, useEffect, useRef, useState } from 'react';
import { BarChart3, TrendingUp, AreaChart } from 'lucide-react';
import { NativeChartViewer } from './NativeChartViewer';

interface ChartDataPoint {
  x: string;
  y: number;
}

interface ChartSpec {
  type: 'line' | 'bar' | 'area';
  title?: string;
  xAxis?: string;
  yAxis?: string;
  data: ChartDataPoint[];
}

interface PlotlySpec {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config?: Record<string, unknown>;
  title?: string;
  chart_type?: string;
}

type ContentSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'plotly'; spec: PlotlySpec };

function splitIntoSegments(markdown: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const blockPattern = /:::(chart|plotly)\s+([\s\S]*?):::/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(markdown)) !== null) {
    const before = markdown.slice(lastIndex, match.index).trim();
    if (before.length > 0) {
      segments.push({ kind: 'markdown', text: before });
    }

    const blockType = match[1] as 'chart' | 'plotly';
    const jsonStr = match[2].trim();

    try {
      const parsed = JSON.parse(jsonStr);

      if (blockType === 'plotly' && parsed.data && Array.isArray(parsed.data)) {
        segments.push({ kind: 'plotly', spec: parsed as PlotlySpec });
      } else if (blockType === 'chart' && parsed.data && Array.isArray(parsed.data)) {
        segments.push({ kind: 'chart', spec: parsed as ChartSpec });
      } else {
        segments.push({ kind: 'markdown', text: match[0] });
      }
    } catch {
      segments.push({ kind: 'markdown', text: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = markdown.slice(lastIndex).trim();
  if (remaining.length > 0) {
    segments.push({ kind: 'markdown', text: remaining });
  }
  return segments;
}

function useResolvedColor(varName: string, fallback: string): string {
  const ref = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const el = ref.current ?? document.documentElement;
    const raw = getComputedStyle(el).getPropertyValue(varName).trim();
    if (raw) setColor(raw);
  }, [varName]);

  return color;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

const CHART_W = 640;
const CHART_H = 300;
const PAD = { top: 24, right: 24, bottom: 64, left: 65 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
const GRID_LINES = 5;

function SVGBarChart({ spec, accentColor, textColor, bgColor }: {
  spec: ChartSpec;
  accentColor: string;
  textColor: string;
  bgColor: string;
}) {
  const maxVal = Math.max(...spec.data.map((d) => d.y), 1);
  const n = spec.data.length;
  const barGap = Math.max(4, Math.min(12, PLOT_W / n * 0.2));
  const barW = Math.max(14, Math.min(48, (PLOT_W - barGap * (n - 1)) / n));
  const totalW = n * barW + (n - 1) * barGap;
  const startX = PAD.left + (PLOT_W - totalW) / 2;
  const gridStep = maxVal / GRID_LINES;
  const gradId = `barGrad-${spec.title?.replace(/\W/g, '') ?? 'default'}`;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto" style={{ maxHeight: 340 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.95} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0.55} />
        </linearGradient>
      </defs>

      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const val = gridStep * i;
        const y = PAD.top + PLOT_H - (val / maxVal) * PLOT_H;
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y}
              stroke={textColor} strokeOpacity={0.1} strokeWidth={1} />
            <text x={PAD.left - 10} y={y + 4} textAnchor="end"
              fill={textColor} fillOpacity={0.5} fontSize={10} fontFamily="system-ui, sans-serif">
              {formatValue(val)}
            </text>
          </g>
        );
      })}

      {spec.data.map((d, i) => {
        const barH = (d.y / maxVal) * PLOT_H;
        const x = startX + i * (barW + barGap);
        const y = PAD.top + PLOT_H - barH;
        return (
          <g key={d.x}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={`url(#${gradId})`} />
            <text x={x + barW / 2} y={y - 8} textAnchor="middle"
              fill={textColor} fillOpacity={0.8} fontSize={11} fontWeight={700}
              fontFamily="system-ui, sans-serif">
              {formatValue(d.y)}
            </text>
            <text x={x + barW / 2} y={PAD.top + PLOT_H + 18} textAnchor="middle"
              fill={textColor} fillOpacity={0.6} fontSize={10} fontWeight={500}
              fontFamily="system-ui, sans-serif">
              {d.x}
            </text>
          </g>
        );
      })}

      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H}
        stroke={textColor} strokeOpacity={0.15} strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={CHART_W - PAD.right} y2={PAD.top + PLOT_H}
        stroke={textColor} strokeOpacity={0.15} strokeWidth={1} />

      {spec.yAxis && (
        <text x={16} y={PAD.top + PLOT_H / 2} textAnchor="middle"
          fill={textColor} fillOpacity={0.4} fontSize={10} fontFamily="system-ui, sans-serif"
          transform={`rotate(-90, 16, ${PAD.top + PLOT_H / 2})`}>
          {spec.yAxis}
        </text>
      )}
      {spec.xAxis && (
        <text x={PAD.left + PLOT_W / 2} y={CHART_H - 6} textAnchor="middle"
          fill={textColor} fillOpacity={0.4} fontSize={10} fontFamily="system-ui, sans-serif">
          {spec.xAxis}
        </text>
      )}
    </svg>
  );
}

function SVGLineChart({ spec, accentColor, textColor, bgColor }: {
  spec: ChartSpec;
  accentColor: string;
  textColor: string;
  bgColor: string;
}) {
  const maxVal = Math.max(...spec.data.map((d) => d.y), 1);
  const minVal = Math.min(...spec.data.map((d) => d.y), 0);
  const range = maxVal - minVal || 1;
  const gridStep = range / GRID_LINES;
  const isArea = spec.type === 'area';
  const areaId = `areaGrad-${spec.title?.replace(/\W/g, '') ?? 'default'}`;

  const points = spec.data.map((d, i) => ({
    px: PAD.left + (i / Math.max(spec.data.length - 1, 1)) * PLOT_W,
    py: PAD.top + PLOT_H - ((d.y - minVal) / range) * PLOT_H,
    label: d.x,
    val: d.y,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].px} ${PAD.top + PLOT_H} L ${points[0].px} ${PAD.top + PLOT_H} Z`;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto" style={{ maxHeight: 340 }}>
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0.03} />
        </linearGradient>
      </defs>

      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const val = minVal + gridStep * i;
        const y = PAD.top + PLOT_H - ((val - minVal) / range) * PLOT_H;
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y}
              stroke={textColor} strokeOpacity={0.1} strokeWidth={1} />
            <text x={PAD.left - 10} y={y + 4} textAnchor="end"
              fill={textColor} fillOpacity={0.5} fontSize={10} fontFamily="system-ui, sans-serif">
              {formatValue(val)}
            </text>
          </g>
        );
      })}

      {isArea && <path d={areaPath} fill={`url(#${areaId})`} />}

      <path d={linePath} fill="none" stroke={accentColor} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p) => (
        <g key={p.label}>
          <circle cx={p.px} cy={p.py} r={5} fill={bgColor} stroke={accentColor} strokeWidth={2.5} />
          <text x={p.px} y={p.py - 12} textAnchor="middle"
            fill={textColor} fillOpacity={0.8} fontSize={11} fontWeight={700}
            fontFamily="system-ui, sans-serif">
            {formatValue(p.val)}
          </text>
        </g>
      ))}

      {points.map((p) => (
        <text key={`xl-${p.label}`} x={p.px} y={PAD.top + PLOT_H + 18} textAnchor="middle"
          fill={textColor} fillOpacity={0.6} fontSize={10} fontWeight={500}
          fontFamily="system-ui, sans-serif">
          {p.label}
        </text>
      ))}

      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H}
        stroke={textColor} strokeOpacity={0.15} strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={CHART_W - PAD.right} y2={PAD.top + PLOT_H}
        stroke={textColor} strokeOpacity={0.15} strokeWidth={1} />

      {spec.yAxis && (
        <text x={16} y={PAD.top + PLOT_H / 2} textAnchor="middle"
          fill={textColor} fillOpacity={0.4} fontSize={10} fontFamily="system-ui, sans-serif"
          transform={`rotate(-90, 16, ${PAD.top + PLOT_H / 2})`}>
          {spec.yAxis}
        </text>
      )}
      {spec.xAxis && (
        <text x={PAD.left + PLOT_W / 2} y={CHART_H - 6} textAnchor="middle"
          fill={textColor} fillOpacity={0.4} fontSize={10} fontFamily="system-ui, sans-serif">
          {spec.xAxis}
        </text>
      )}
    </svg>
  );
}

export function ChartCard({ spec }: { spec: ChartSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState({ accent: '#ee0000', text: '#1a1a2e', bg: '#ffffff' });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const accent = cs.getPropertyValue('--chart-1').trim() || '#ee0000';
    const text = cs.getPropertyValue('--foreground').trim() || cs.color || '#1a1a2e';
    const bg = cs.getPropertyValue('--background').trim() || '#ffffff';
    setColors({ accent, text, bg });
  }, []);

  const TypeIcon = spec.type === 'bar' ? BarChart3 : spec.type === 'area' ? AreaChart : TrendingUp;

  return (
    <div ref={containerRef} className="border border-border rounded-xl bg-card overflow-hidden my-5 shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <TypeIcon className="w-4 h-4 text-primary" />
        </div>
        <span className="text-sm font-semibold text-foreground flex-1">{spec.title ?? 'Chart'}</span>
        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize font-medium tracking-wide">
          {spec.type}
        </span>
      </div>
      <div className="px-4 py-5 bg-card">
        {spec.type === 'bar'
          ? <SVGBarChart spec={spec} accentColor={colors.accent} textColor={colors.text} bgColor={colors.bg} />
          : <SVGLineChart spec={spec} accentColor={colors.accent} textColor={colors.text} bgColor={colors.bg} />
        }
      </div>
    </div>
  );
}

export function PlotlyCard({ spec }: { spec: PlotlySpec }) {
  return (
    <div className="my-5">
      <NativeChartViewer
        figure={{ data: spec.data, layout: spec.layout, config: spec.config }}
        title={spec.title ?? (spec.layout.title as string | undefined)}
        chartType={spec.chart_type}
      />
    </div>
  );
}

export function useContentSegments(markdown: string) {
  return useMemo(() => splitIntoSegments(markdown), [markdown]);
}

export type { ContentSegment, ChartSpec, PlotlySpec };
