export type OrganizationType = "personal" | "family" | "company";
export type MemberRole = "owner" | "admin" | "manager" | "viewer";
export type UnitStatus = "alugado" | "vago" | "manutencao" | "negociacao" | "venda" | "vendido";

export type Organization = {
  id: string;
  name: string;
  type: OrganizationType;
  description: string;
  currency: string;
  role: MemberRole;
};

export type Building = {
  id: string;
  name: string;
  city: string;
  state: string;
  value: number;
  units: number;
  occupied: number;
  revenue: number;
  expenses: number;
  status: "ativo" | "reforma" | "venda" | "vendido" | "inativo";
  image: string;
  unitsData?: PropertyUnit[];
  sourceRows?: number;
};

export type PropertyUnit = {
  id: string;
  code: string;
  type: string;
  area: number;
  status: UnitStatus;
  rent: number;
  tenant?: string;
  nextDue?: string;
  sourceId?: string;
  quantity?: number;
};

export type Activity = {
  id: string;
  type: "valuation" | "payment" | "expense";
  title: string;
  detail: string;
  value: string;
  date: string;
};
