"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { month: "Mar", value: 31.2, revenue: 242 }, { month: "Abr", value: 32.1, revenue: 248 }, { month: "Mai", value: 32.6, revenue: 261 },
  { month: "Jun", value: 33.7, revenue: 274 }, { month: "Jul", value: 34.2, revenue: 281 }, { month: "Ago", value: 35.8, revenue: 296 },
];

export function WealthChart() {
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 7, right: 4, left: -23, bottom: 0 }}>
    <defs><linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#80e2b0" stopOpacity={0.24} /><stop offset="100%" stopColor="#80e2b0" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="rgba(176,196,219,.09)" />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#748198", fontSize: 10 }} dy={8} />
    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#748198", fontSize: 10 }} tickFormatter={(v) => `R$ ${v}M`} domain={[30, 37]} />
    <Tooltip contentStyle={{ background: "#151d29", border: "1px solid rgba(176,196,219,.14)", borderRadius: 10, fontSize: 11 }} labelStyle={{ color: "#8490a5" }} formatter={(value: number) => [`R$ ${value.toFixed(1)} mi`, "Patrimônio"]} />
    <Area type="monotone" dataKey="value" stroke="#80e2b0" strokeWidth={2.5} fill="url(#wealthFill)" dot={{ fill: "#80e2b0", stroke: "#101721", strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
  </AreaChart></ResponsiveContainer></div>;
}
