import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CATEGORICAL, CHART_INK } from '@/components/charts/palette'

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${CHART_INK.grid}`,
  boxShadow: '0 4px 12px rgba(11,11,11,0.08)',
}

const axisTick = { fontSize: 11, fill: CHART_INK.muted }

export function CategoryBarChart({
  data,
  series,
  height = 220,
  horizontal = false,
}: {
  data: Record<string, string | number>[]
  series: { key: string; label: string; color?: string }[]
  height?: number
  horizontal?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={!horizontal} horizontal={horizontal} strokeDasharray="0" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CATEGORICAL[i % CATEGORICAL.length]} radius={[3, 3, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TrendLineChart({
  data,
  dataKey,
  color = CATEGORICAL[0],
  height = 220,
}: {
  data: Record<string, string | number>[]
  dataKey: string
  color?: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({
  data,
  height = 200,
}: {
  data: { name: string; value: number }[]
  height?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={height} height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2} stroke={CHART_INK.surface} strokeWidth={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--color-ink-soft)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORICAL[i % CATEGORICAL.length] }} />
              {d.name}
            </span>
            <span className="font-medium text-[var(--color-ink)]">
              {d.value} <span className="text-[var(--color-ink-faint)]">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
