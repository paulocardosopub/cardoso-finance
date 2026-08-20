import Link from "next/link";
import { ArrowLeft, Building2, MapPin, Ruler } from "lucide-react";
import { initialBuildingsForApp } from "@/lib/initial-data";
import { brl, compactBrl } from "@/lib/format";

export function generateStaticParams() {
  return initialBuildingsForApp.map((building) => ({ id: building.id }));
}

export default async function GenericBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const building = initialBuildingsForApp.find((item) => item.id === id) ?? initialBuildingsForApp[0];
  const units = building.unitsData ?? [];
  const statusLabel: Record<string, string> = { alugado: "Alugado", vago: "Vago", venda: "À venda", manutencao: "Manutenção" };
  const occupancy = building.units ? Math.round((building.occupied / building.units) * 100) : 0;

  return <div className="content">
    <Link href="/imoveis" className="breadcrumb" style={{ marginBottom: 25, display: "inline-flex" }}><ArrowLeft size={13} /> Imóveis</Link>
    <div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> {building.status}</div><h1>{building.name}</h1><p className="subtitle"><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {building.city}, {building.state} · {building.units} unidades</p></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Resumo do ativo</h2><p>Dados iniciais importados da planilha · {building.sourceRows} registros de origem.</p></div></div><div className="metrics"><div className="metric-card"><div className="metric-top"><span>Valor patrimonial</span></div><div className="metric-value">{compactBrl(building.value)}</div></div><div className="metric-card"><div className="metric-top"><span>Ocupação</span></div><div className="metric-value">{occupancy}%</div></div><div className="metric-card"><div className="metric-top"><span>Receita mensal</span></div><div className="metric-value">{compactBrl(building.revenue)}</div></div></div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Unidades e itens agrupados</h2><p>{units.length} registros preservados; quantidades compostas mantêm a descrição original.</p></div></div><div className="table-wrap"><table><thead><tr><th>Unidade</th><th>Tipo</th><th>Quantidade</th><th>Status</th><th>Aluguel mensal</th></tr></thead><tbody>{units.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong></td><td><span>{unit.type}</span><small><Ruler size={11} /> Área não informada na planilha</small></td><td>{unit.quantity ?? 1}</td><td><span className={`status status-${unit.status === "venda" ? "vago" : unit.status}`}>{statusLabel[unit.status] ?? unit.status}</span></td><td><strong>{unit.rent ? brl(unit.rent) : "—"}</strong></td></tr>)}</tbody></table></div></div>
  </div>;
}
