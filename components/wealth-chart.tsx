"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Building } from "@/types/domain";

export function WealthChart({ buildings }: { buildings: Building[] }) {
  const data = buildings.map((building) => ({ group: building.name, value: building.value / 1_000_000 }));
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 7, right: 4, left: -23, bottom: 0 }}>
    <defs><linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#80e2b0" stopOpacity={0.24} /><stop offset="100%" stopColor="#80e2b0" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="rgba(176,196,219,.09)" />
    <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: "#748198", fontSize: 9 }} tickFormatter={(value: string) => value.length > 11 ? `${value.slice(0, 11)}…` : value} dy={8} interval={0} />
    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#748198", fontSize: 10 }} tickFormatter={(v) => `R$ ${v}M`} domain={["auto", "auto"]} />
    <Tooltip contentStyle={{ background: "#151d29", border: "1px solid rgba(176,196,219,.14)", borderRadius: 10, fontSize: 11 }} labelStyle={{ color: "#8490a5" }} formatter={(value: number) => [`R$ ${value.toFixed(2)} mi`, "Avaliação"]} />
    <Area type="monotone" dataKey="value" stroke="#80e2b0" strokeWidth={2.5} fill="url(#wealthFill)" dot={{ fill: "#80e2b0", stroke: "#101721", strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
  </AreaChart></ResponsiveContainer></div>;
}
