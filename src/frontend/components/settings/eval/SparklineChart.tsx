import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Renders a minimal Recharts line sparkline for an array of historical score values. */
export function SparklineChart({
  data,
  width = 120,
  height = 32,
  color = '#2563eb',
}: SparklineChartProps) {
  if (data.length < 2) return null;

  const chartData = data.map((value, index) => ({ index, value: value * 100 }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
