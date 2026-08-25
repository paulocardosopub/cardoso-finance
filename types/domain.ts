export type OrganizationType = "personal" | "family" | "company";
export type MemberRole = "owner" | "admin" | "manager" | "viewer";
export type MemberVisibility = {
  showTotalAssets: boolean;
  showPropertyValues: boolean;
  showRentalInfo: boolean;
  showPropertyStatus: boolean;
  showPhotos: boolean;
  showLocations: boolean;
  showMap: boolean;
  showDocuments: boolean;
  showOwnershipByBeneficiary: boolean;
};

export type MemberSummary = {
  totalValue: number;
  totalBuildings: number;
  totalUnits: number;
  totalRent: number;
  ownershipPercentage: number;
};

export type OwnershipSummary = { name: string; percentage: number };
export type UnitStatus = "alugado" | "vago" | "manutencao" | "servico" | "negociacao" | "venda" | "venda_alugado" | "vendido";
export type ExpenseKind = "fixed" | "recurring" | "one_time";
export type LeasePaymentStatus = "pending" | "paid" | "overdue" | "partial" | "waived";

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
  responsibilities?: Array<{ user_id?: string; contact_id?: string; share_percentage: number }>;
};

export type MemberExpenseRecord = {
  id: string;
  description: string;
  category: string;
  value: number;
  expense_date: string;
  expense_kind: ExpenseKind;
  responsible: "Holding" | "Sua responsabilidade";
  building_id?: string | null;
  is_holding_expense: boolean;
  member_share: number;
};

export type LeasePaymentRecord = {
  id: string;
  leaseId: string;
  competence: string;
  dueDate: string;
  expectedAmount: number;
  receivedAmount: number;
  receivedAt?: string;
  discount: number;
  fine: number;
  interest: number;
  managementFee: number;
  otherDiscounts: number;
  netAmount: number;
  status: LeasePaymentStatus;
  notes?: string;
};

export type DistributionRecord = {
  id: string;
  distributionDate: string;
  description: string;
  totalValue: number;
  status: string;
  items: Array<{ id: string; userId?: string; contactId?: string; percentage: number; value: number; paymentStatus: string; paidAt?: string }>;
};

export type BankAccount = {
  id: string;
  name: string;
  initialBalance: number;
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
  dueDay?: number;
  lastPaymentDate?: string;
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
