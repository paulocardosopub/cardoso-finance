export type OrganizationType = "personal" | "family" | "company";
export type MemberRole = "owner" | "admin" | "manager" | "viewer";
export type UnitStatus = "alugado" | "vago" | "manutencao" | "servico" | "negociacao" | "venda" | "venda_alugado" | "vendido";
export type ExpenseKind = "fixed" | "recurring" | "one_time";

export type ExpenseRecord = {
  id: string;
  description: string;
  category: string;
  value: number;
  expense_date: string;
  competence?: string;
  expense_kind: ExpenseKind;
  responsible?: string;
  responsible_user_id?: string;
  responsible_contact_id?: string;
  building_id?: string;
};

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
  dbId?: string;
  assetId?: string;
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
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  acquisitionDate?: string;
  acquisitionValue?: number;
  lastValuationDate?: string;
  notes?: string;
  unitsData?: PropertyUnit[];
  sourceRows?: number;
  sourceKey?: string;
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
  tenantName?: string;
  lease?: LeaseSummary;
};

export type LeaseSummary = {
  id: string;
  tenantId?: string;
  tenantName?: string;
  startDate?: string;
  endDate?: string;
  currentRent: number;
  nextAdjustmentDate?: string;
  adjustmentFrequency?: string;
  adjustmentIndex?: string;
  contractDocumentUrl?: string;
  notes?: string;
  status: string;
};

export type NotificationItem = {
  id: string;
  type: "lease_ending" | "rent_adjustment" | "general";
  title: string;
  message: string;
  dueDate: string;
  status: string;
  entityId?: string;
};

export type Activity = {
  id: string;
  type: "valuation" | "payment" | "expense";
  title: string;
  detail: string;
  value: string;
  date: string;
};
