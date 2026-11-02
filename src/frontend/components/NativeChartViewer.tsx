import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Maximize2, Minimize2, Download, RotateCcw, X,
  ZoomIn, ZoomOut, Move, Crosshair, MousePointer,
  BarChart3, LineChart, PieChart, ScatterChart, BarChartHorizontal,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface NativeChartViewerProps {
  figure: PlotlyFigure;
  title?: string;
  chartType?: string;
  className?: string;
}

interface PlotlyAPI {
  newPlot: (
    el: HTMLDivElement,
    data: PlotlyFigure['data'],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
  ) => Promise<HTMLDivElement>;
  Plots: { resize: (el: HTMLDivElement) => void };
  purge: (el: HTMLDivElement) => void;
  relayout: (el: HTMLDivElement, update: Record<string, unknown>) => void;
  downloadImage: (
    el: HTMLDivElement,
    opts: Record<string, unknown>,
  ) => Promise<string>;
}

const PLOTLY_CDN = 'https://cdn.plot.ly/plotly-2.35.2.min.js';

let plotlyPromise: Promise<PlotlyAPI> | null = null;

function loadPlotlyFromCDN(): Promise<PlotlyAPI> {
  if (plotlyPromise) return plotlyPromise;

  const existing = (globalThis as unknown as { Plotly?: PlotlyAPI }).Plotly;
  if (existing?.newPlot) {
    plotlyPromise = Promise.resolve(existing);
    return plotlyPromise;
  }

  plotlyPromise = new Promise<PlotlyAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLOTLY_CDN;
    script.async = true;
    script.onload = () => {
      const Plotly = (globalThis as unknown as { Plotly?: PlotlyAPI }).Plotly;
      if (Plotly?.newPlot) {
        resolve(Plotly);
      } else {
        reject(new Error('Plotly loaded but API not available'));
      }
    };
    script.onerror = () => {
      plotlyPromise = null;
      reject(new Error('Failed to load Plotly from CDN'));
    };
    document.head.appendChild(script);
  });

  return plotlyPromise;
}

function isDarkMode(): boolean {
  // The app toggles the `dark` class on <html>. When present -> dark mode.
  // When absent -> light mode. OS preference is irrelevant because the app
  // always explicitly manages the class via useThemeSync.
  return document.documentElement.classList.contains('dark');
}

interface ThemeColors {
  title: string;
  axisLabel: string;
  tickText: string;
  legend: string;
  grid: string;
  zeroline: string;
  bg: string;
}

function getThemeColors(dark: boolean): ThemeColors {
  if (dark) {
    return {
      title: '#f4f4f5',
      axisLabel: '#d4d4d8',
      tickText: '#a1a1aa',
      legend: '#d4d4d8',
      grid: 'rgba(228,228,231,0.12)',
      zeroline: 'rgba(228,228,231,0.20)',
      bg: 'rgba(0,0,0,0)',
    };
  }
  return {
    title: '#09090b',
    axisLabel: '#18181b',
    tickText: '#3f3f46',
    legend: '#27272a',
    grid: 'rgba(0,0,0,0.08)',
    zeroline: 'rgba(0,0,0,0.15)',
    bg: 'rgba(0,0,0,0)',
  };
}

function themedAxisOverrides(
  axis: Record<string, unknown> | undefined,
  colors: ThemeColors,
): Record<string, unknown> {
  return {
    ...axis,
    gridcolor: colors.grid,
    zerolinecolor: colors.zeroline,
    linecolor: colors.grid,
    tickfont: {
      ...(axis?.tickfont as Record<string, unknown> | undefined),
      color: colors.tickText,
      size: 11,
    },
    titlefont: {
      ...(axis?.titlefont as Record<string, unknown> | undefined),
      color: colors.axisLabel,
      size: 12,
    },
  };
}

function buildThemedLayout(
  baseLayout: Record<string, unknown>,
  dark: boolean,
): Record<string, unknown> {
  const c = getThemeColors(dark);

  return {
    ...baseLayout,
    paper_bgcolor: c.bg,
    plot_bgcolor: c.bg,
    font: {
      ...(baseLayout.font as Record<string, unknown> | undefined),
      color: c.tickText,
      family: 'system-ui, -apple-system, sans-serif',
    },
    xaxis: themedAxisOverrides(
      baseLayout.xaxis as Record<string, unknown> | undefined, c,
    ),
    yaxis: themedAxisOverrides(
      baseLayout.yaxis as Record<string, unknown> | undefined, c,
    ),
    legend: {
      ...(baseLayout.legend as Record<string, unknown> | undefined),
      font: {
        ...((baseLayout.legend as Record<string, unknown> | undefined)?.font as Record<string, unknown> | undefined),
        color: c.legend,
        size: 12,
      },
      bgcolor: 'rgba(0,0,0,0)',
      borderwidth: 0,
    },
    title: baseLayout.title
      ? {
          text: typeof baseLayout.title === 'string'
            ? baseLayout.title
            : (baseLayout.title as Record<string, unknown>)?.text,
          font: {
            color: c.title,
            size: 14,
            family: 'system-ui, -apple-system, sans-serif',
          },
        }
      : undefined,
    autosize: true,
    margin: {
      l: 60,
      r: 24,
      t: baseLayout.title ? 48 : 24,
      b: 48,
      ...(baseLayout.margin as Record<string, unknown> | undefined),
    },
  };
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  responsive: true,
  displayModeBar: false,
  displaylogo: false,
  scrollZoom: true,
};

type DragMode = 'zoom' | 'pan' | 'select' | false;
type ChartMode = 'original' | 'bar' | 'barh' | 'line' | 'pie' | 'scatter';

const CHART_MODES: { mode: ChartMode; label: string; icon: typeof BarChart3 }[] = [
  { mode: 'bar', label: 'Bar', icon: BarChart3 },
  { mode: 'barh', label: 'Horizontal bar', icon: BarChartHorizontal },
  { mode: 'line', label: 'Line', icon: LineChart },
  { mode: 'pie', label: 'Pie', icon: PieChart },
  { mode: 'scatter', label: 'Scatter', icon: ScatterChart },
];

function extractXY(trace: Record<string, unknown>): {
  labels: unknown[];
  values: unknown[];
} {
  const x = trace.x as unknown[] | undefined;
  const y = trace.y as unknown[] | undefined;
  const tLabels = trace.labels as unknown[] | undefined;
  const tValues = trace.values as unknown[] | undefined;

  if (tLabels && tValues) return { labels: tLabels, values: tValues };

  const isHorizontal = trace.orientation === 'h';
  return {
    labels: isHorizontal ? (y ?? []) : (x ?? []),
    values: isHorizontal ? (x ?? []) : (y ?? []),
  };
}

function convertTraces(
  original: Array<Record<string, unknown>>,
  mode: ChartMode,
): Array<Record<string, unknown>> {
  if (mode === 'original') return original;

  return original.map((trace) => {
    const { labels, values } = extractXY(trace);
    const name = trace.name as string | undefined;
    const marker = trace.marker as Record<string, unknown> | undefined;

    switch (mode) {
      case 'bar':
        return {
          type: 'bar',
          x: labels,
          y: values,
          name,
          marker,
        };
      case 'barh':
        return {
          type: 'bar',
          x: values,
          y: labels,
          orientation: 'h',
          name,
          marker,
        };
      case 'line':
        return {
          type: 'scatter',
          mode: 'lines+markers',
          x: labels,
          y: values,
          name,
          marker,
          line: { width: 2 },
        };
      case 'pie':
        return {
          type: 'pie',
          labels,
          values,
          name,
          marker,
          textinfo: 'label+percent',
          hole: 0.35,
        };
      case 'scatter':
        return {
          type: 'scatter',
          mode: 'markers',
          x: labels,
          y: values,
          name,
          marker: { ...marker, size: 10 },
        };
      default:
        return trace;
    }
  });
}

function ToolbarButton({
  active, onClick, title, children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function NativeChartViewer({
  figure,
  title,
  chartType,
  className,
}: NativeChartViewerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<PlotlyAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>('zoom');
  const [dark, setDark] = useState(isDarkMode);
  const [chartMode, setChartMode] = useState<ChartMode>('original');

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const themedLayout = useMemo(
    () => buildThemedLayout(figure.layout, dark),
    [figure.layout, dark],
  );

  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...figure.config }),
    [figure.config],
  );

  const activeData = useMemo(
    () => chartMode === 'original' ? figure.data : convertTraces(figure.data, chartMode),
    [figure.data, chartMode],
  );

  const activeLayout = useMemo((): Record<string, unknown> => {
    const base: Record<string, unknown> = { ...themedLayout, dragmode: dragMode };
    if (chartMode === 'barh') {
      const xaxis = base.xaxis as Record<string, unknown> | undefined;
      const yaxis = base.yaxis as Record<string, unknown> | undefined;
      const { range: _xr, type: _xt, ...xRest } = xaxis ?? {};
      const { range: _yr, type: _yt, ...yRest } = yaxis ?? {};
      return {
        ...base,
        xaxis: {
          ...yRest,
          title: yaxis?.title ?? xaxis?.title,
          autorange: true,
          type: 'linear',
        },
        yaxis: {
          ...xRest,
          title: xaxis?.title ?? yaxis?.title,
          autorange: true,
          automargin: true,
          type: 'category',
        },
      };
    }
    if (chartMode === 'pie') {
      return {
        ...base,
        xaxis: { ...(base.xaxis as Record<string, unknown>), visible: false },
        yaxis: { ...(base.yaxis as Record<string, unknown>), visible: false },
      };
    }
    if (chartMode !== 'original') {
      const xaxis = base.xaxis as Record<string, unknown> | undefined;
      const yaxis = base.yaxis as Record<string, unknown> | undefined;
      return {
        ...base,
        xaxis: { ...xaxis, autorange: true },
        yaxis: { ...yaxis, autorange: true },
      };
    }
    return base;
  }, [themedLayout, dragMode, chartMode]);

  const renderChart = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      setLoading(true);
      setError(null);
      const Plotly = await loadPlotlyFromCDN();
      plotlyRef.current = Plotly;
      await Plotly.newPlot(
        chartRef.current,
        activeData,
        activeLayout,
        config,
      );
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render chart');
      setLoading(false);
    }
  }, [activeData, activeLayout, config]);

  useEffect(() => {
    renderChart();
    return () => {
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.purge(chartRef.current);
      }
    };
  }, [renderChart]);

  useEffect(() => {
    if (!chartRef.current || !plotlyRef.current) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.Plots.resize(chartRef.current);
      }
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => renderChart();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [renderChart]);

  const handleDragMode = useCallback((mode: DragMode) => {
    setDragMode(mode);
    if (chartRef.current && plotlyRef.current) {
      plotlyRef.current.relayout(chartRef.current, { dragmode: mode });
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!chartRef.current || !plotlyRef.current) return;
    const el = chartRef.current as HTMLDivElement & { layout?: Record<string, unknown> };
    const xaxis = el.layout?.xaxis as Record<string, unknown> | undefined;
    const yaxis = el.layout?.yaxis as Record<string, unknown> | undefined;
    const xRange = xaxis?.range as [number, number] | undefined;
    const yRange = yaxis?.range as [number, number] | undefined;
    if (xRange && yRange) {
      const xMid = (xRange[0] + xRange[1]) / 2;
      const yMid = (yRange[0] + yRange[1]) / 2;
      const xSpan = (xRange[1] - xRange[0]) * 0.35;
      const ySpan = (yRange[1] - yRange[0]) * 0.35;
      plotlyRef.current.relayout(chartRef.current, {
        'xaxis.range': [xMid - xSpan, xMid + xSpan],
        'yaxis.range': [yMid - ySpan, yMid + ySpan],
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!chartRef.current || !plotlyRef.current) return;
    const el = chartRef.current as HTMLDivElement & { layout?: Record<string, unknown> };
    const xaxis = el.layout?.xaxis as Record<string, unknown> | undefined;
    const yaxis = el.layout?.yaxis as Record<string, unknown> | undefined;
    const xRange = xaxis?.range as [number, number] | undefined;
    const yRange = yaxis?.range as [number, number] | undefined;
    if (xRange && yRange) {
      const xMid = (xRange[0] + xRange[1]) / 2;
      const yMid = (yRange[0] + yRange[1]) / 2;
      const xSpan = (xRange[1] - xRange[0]) * 0.75;
      const ySpan = (yRange[1] - yRange[0]) * 0.75;
      plotlyRef.current.relayout(chartRef.current, {
        'xaxis.range': [xMid - xSpan, xMid + xSpan],
        'yaxis.range': [yMid - ySpan, yMid + ySpan],
      });
    }
  }, []);

  const handleReset = useCallback(() => {
    if (chartRef.current && plotlyRef.current) {
      plotlyRef.current.relayout(chartRef.current, {
        'xaxis.autorange': true,
        'yaxis.autorange': true,
      });
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!chartRef.current || !plotlyRef.current) return;
    await plotlyRef.current.downloadImage(chartRef.current, {
      format: 'png',
      filename: title?.replace(/\s+/g, '_') ?? 'chart',
      height: 800,
      width: 1200,
      scale: 2,
    });
  }, [title]);

  const displayType = chartMode !== 'original'
    ? CHART_MODES.find(m => m.mode === chartMode)?.label ?? 'chart'
    : chartType
      ? chartType.replace(/_/g, ' ')
      : 'chart';

  const iconSize = 'w-3.5 h-3.5';

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => {
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.Plots.resize(chartRef.current);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [expanded]);

  const toolbar = (isModal: boolean) => (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-8 4 4 4-6" />
          </svg>
        </div>
        <span className={cn('font-semibold text-foreground truncate', isModal ? 'text-base' : 'text-sm')}>
          {title ?? 'Interactive Chart'}
        </span>
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full capitalize font-medium tracking-wide flex-shrink-0">
          {displayType}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          <ToolbarButton active={dragMode === 'zoom'} onClick={() => handleDragMode('zoom')} title="Box zoom">
            <Crosshair className={iconSize} />
          </ToolbarButton>
          <ToolbarButton active={dragMode === 'pan'} onClick={() => handleDragMode('pan')} title="Pan">
            <Move className={iconSize} />
          </ToolbarButton>
          <ToolbarButton active={dragMode === 'select'} onClick={() => handleDragMode('select')} title="Box select">
            <MousePointer className={iconSize} />
          </ToolbarButton>
        </div>

        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          <ToolbarButton onClick={handleZoomIn} title="Zoom in">
            <ZoomIn className={iconSize} />
          </ToolbarButton>
          <ToolbarButton onClick={handleZoomOut} title="Zoom out">
            <ZoomOut className={iconSize} />
          </ToolbarButton>
          <ToolbarButton onClick={handleReset} title="Reset axes">
            <RotateCcw className={iconSize} />
          </ToolbarButton>
        </div>

        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          {CHART_MODES.map(({ mode, label, icon: Icon }) => (
            <ToolbarButton
              key={mode}
              active={chartMode === mode}
              onClick={() => setChartMode(prev => prev === mode ? 'original' : mode)}
              title={label}
            >
              <Icon className={iconSize} />
            </ToolbarButton>
          ))}
        </div>

        <ToolbarButton onClick={handleDownload} title="Download PNG">
          <Download className={iconSize} />
        </ToolbarButton>
        {isModal ? (
          <ToolbarButton onClick={() => setExpanded(false)} title="Close">
            <X className={iconSize} />
          </ToolbarButton>
        ) : (
          <ToolbarButton onClick={() => setExpanded(true)} title="Fullscreen">
            <Maximize2 className={iconSize} />
          </ToolbarButton>
        )}
      </div>
    </div>
  );

  const chartArea = (
    <div className={cn('relative', expanded ? 'flex-1 min-h-0' : 'min-h-[320px]')}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading chart...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
          <div className="text-center px-6">
            <p className="text-sm text-red-500 font-medium">Chart rendering failed</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <button
              type="button"
              onClick={() => renderChart()}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <div
        ref={chartRef}
        className={cn('w-full', expanded ? 'h-full' : 'h-[400px]')}
      />
    </div>
  );

  const modal = expanded
    ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
            role="presentation"
          />
          <div className="relative z-10 w-[92vw] h-[88vh] max-w-[1400px] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {toolbar(true)}
            {chartArea}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className={cn(
          'border border-border rounded-xl bg-card overflow-hidden shadow-sm',
          className,
        )}
      >
        {toolbar(false)}
        {!expanded && chartArea}
      </div>
      {modal}
    </>
  );
}

/**
 * Extract a Plotly figure from tool call data.
 */
export function extractPlotlyFigure(
  toolCall: Record<string, unknown>,
): PlotlyFigure | null {
  const mcpApp = toolCall.mcpApp as Record<string, unknown> | undefined;

  if (mcpApp) {
    const result = mcpApp.result as Record<string, unknown> | undefined;
    const sc = result?.structuredContent as Record<string, unknown> | undefined;
    const figure = sc?.figure as PlotlyFigure | undefined;
    if (figure && Array.isArray(figure.data)) {
      return figure;
    }
  }

  const artifact = toolCall.artifact as Record<string, unknown> | undefined;
  if (artifact) {
    const mcpArt = (artifact.mcp_app ?? artifact.mcpApp) as Record<string, unknown> | undefined;
    if (mcpArt) {
      const result = mcpArt.result as Record<string, unknown> | undefined;
      const sc = result?.structuredContent as Record<string, unknown> | undefined;
      const figure = sc?.figure as PlotlyFigure | undefined;
      if (figure && Array.isArray(figure.data)) {
        return figure;
      }
    }
  }

  const content = toolCall.content;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const figure = parsed.figure as PlotlyFigure | undefined;
      if (figure && Array.isArray(figure.data)) {
        return figure;
      }
    } catch {
      // content is not JSON with figure data
    }
  }

  return null;
}

export function extractChartMeta(
  toolCall: Record<string, unknown>,
): { title?: string; chartType?: string } {
  const args = toolCall.args as Record<string, unknown> | undefined;
  const mcpApp = toolCall.mcpApp as Record<string, unknown> | undefined;
  const mcpArgs = mcpApp?.arguments as Record<string, unknown> | undefined;

  const title = (mcpArgs?.title ?? args?.title) as string | undefined;
  const chartType = (mcpArgs?.chart_type ?? args?.chart_type) as string | undefined;

  return { title, chartType };
}
