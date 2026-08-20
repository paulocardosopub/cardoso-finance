import Link from "next/link";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { demoBuildings } from "@/lib/demo-data";
import { compactBrl } from "@/lib/format";

export default async function GenericBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const building = demoBuildings.find((item) => item.id === id) ?? demoBuildings[0];
  return <div className="content"><Link href="/imoveis" className="breadcrumb" style={{ marginBottom: 25, display: "inline-flex" }}><ArrowLeft size={13} /> Imóveis</Link><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> {building.status}</div><h1>{building.name}</h1><p className="subtitle"><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {building.city}, {building.state} · {building.units} unidades</p></div></div><div className="panel"><div className="panel-heading"><div><h2>Resumo do ativo</h2><p>Detalhamento operacional em preparação para o CRUD Supabase.</p></div></div><div className="metrics"><div className="metric-card"><div className="metric-top"><span>Valor patrimonial</span></div><div className="metric-value">{compactBrl(building.value)}</div></div><div className="metric-card"><div className="metric-top"><span>Ocupação</span></div><div className="metric-value">{Math.round((building.occupied / building.units) * 100)}%</div></div></div></div></div>;
}
