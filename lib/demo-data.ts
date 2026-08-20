import type { Activity, Building, Organization, PropertyUnit } from "@/types/domain";

export const demoOrganizations: Organization[] = [
  { id: "personal", name: "Patrimônio Pessoal", type: "personal", description: "Seu patrimônio consolidado", currency: "BRL", role: "owner" },
  { id: "cardoso", name: "Cardoso Participações", type: "company", description: "Holding patrimonial familiar", currency: "BRL", role: "owner" },
  { id: "familia", name: "Família Cardoso", type: "family", description: "Planejamento familiar", currency: "BRL", role: "admin" },
];

export const demoBuildings: Building[] = [
  { id: "edificio-cardoso", name: "Edifício Cardoso", city: "São Paulo", state: "SP", value: 18_500_000, units: 22, occupied: 20, revenue: 184_500, expenses: 42_800, status: "ativo", image: "building-cardoso" },
  { id: "villa-madalena", name: "Villa Madalena Offices", city: "São Paulo", state: "SP", value: 9_800_000, units: 8, occupied: 7, revenue: 96_000, expenses: 19_500, status: "ativo", image: "building-villa" },
  { id: "galpao-anhanguera", name: "Galpão Anhanguera", city: "Jundiaí", state: "SP", value: 7_500_000, units: 1, occupied: 1, revenue: 61_000, expenses: 12_000, status: "ativo", image: "building-galpao" },
];

export const demoUnits: PropertyUnit[] = [
  { id: "101", code: "101", type: "Apartamento", area: 68, status: "alugado", rent: 8_500, tenant: "Mariana Oliveira", nextDue: "10/09/2026" },
  { id: "102", code: "102", type: "Apartamento", area: 72, status: "alugado", rent: 9_200, tenant: "Rafael Mendes", nextDue: "10/09/2026" },
  { id: "103", code: "103", type: "Apartamento", area: 72, status: "vago", rent: 9_200 },
  { id: "104", code: "104", type: "Apartamento", area: 68, status: "manutencao", rent: 8_500 },
  { id: "201", code: "201", type: "Apartamento", area: 90, status: "alugado", rent: 11_800, tenant: "Studio Norte Ltda.", nextDue: "05/09/2026" },
  { id: "202", code: "202", type: "Apartamento", area: 90, status: "alugado", rent: 12_100, tenant: "Camila Reis", nextDue: "10/09/2026" },
  { id: "203", code: "203", type: "Apartamento", area: 90, status: "alugado", rent: 11_800, tenant: "João Pedro Silva", nextDue: "10/09/2026" },
  { id: "204", code: "204", type: "Apartamento", area: 90, status: "alugado", rent: 12_400, tenant: "Fernanda Neri", nextDue: "10/09/2026" },
  { id: "301", code: "301", type: "Apartamento", area: 90, status: "alugado", rent: 13_200, tenant: "Aurum Consultoria", nextDue: "08/09/2026" },
  { id: "302", code: "302", type: "Apartamento", area: 90, status: "alugado", rent: 13_200, tenant: "Lucas Cardoso", nextDue: "10/09/2026" },
];

export const demoActivities: Activity[] = [
  { id: "a1", type: "valuation", title: "Avaliação atualizada", detail: "Edifício Cardoso", value: "R$ 18.000.000 → R$ 18.500.000", date: "Hoje, 09:42" },
  { id: "a2", type: "payment", title: "Aluguel recebido", detail: "Unidade 201 · Studio Norte Ltda.", value: "R$ 11.800", date: "Ontem, 16:18" },
  { id: "a3", type: "expense", title: "Nova despesa", detail: "Manutenção do elevador", value: "R$ 4.800", date: "12 ago, 11:05" },
];
