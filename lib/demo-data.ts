import type { Activity, Building, Organization, PropertyUnit } from "@/types/domain";
import { initialBuildings, initialUnitsByBuilding } from "@/lib/initial-property-data";

export const demoOrganizations: Organization[] = [
  { id: "personal", name: "Patrimônio Pessoal", type: "personal", description: "Seu patrimônio consolidado", currency: "BRL", role: "owner" },
  { id: "cardoso", name: "Cardoso Participações", type: "company", description: "Holding patrimonial familiar", currency: "BRL", role: "owner" },
  { id: "familia", name: "Família Cardoso", type: "family", description: "Planejamento familiar", currency: "BRL", role: "admin" },
];

export const demoBuildings: Building[] = initialBuildings;

export const demoUnits: PropertyUnit[] = initialUnitsByBuilding.get("405-cruzeiro") ?? [];

export const demoActivities: Activity[] = [
  { id: "a1", type: "valuation", title: "Dados iniciais importados", detail: "dados imoveis.xlsx · 63 registros", value: "Carteira agrupada por prédio", date: "Hoje" },
  { id: "a2", type: "payment", title: "Receita identificada", detail: "Unidades alugadas na planilha", value: "Valores mensais preservados", date: "Hoje" },
  { id: "a3", type: "valuation", title: "Unidades organizadas", detail: "Kitnets, lojas, apartamentos e terrenos", value: "Prédios criados automaticamente", date: "Hoje" },
];
