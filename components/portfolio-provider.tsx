"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { Building, ExpenseRecord, LeaseSummary, MemberRole, NotificationItem, PropertyUnit } from "@/types/domain";

type PortfolioContextValue = {
  organizationId: string | null;
  organizationName: string;
  userName: string;
  userInitials: string;
  holdings: Array<{ id: string; name: string; role: MemberRole }>;
  pendingInvitations: PendingInvitation[];
  role: MemberRole;
  buildings: Building[];
  expenses: ExpenseRecord[];
  monthlyExpenses: number;
  monthlyProfit: number;
  notifications: NotificationItem[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  switchOrganization: (organizationId: string) => void;
  acceptInvitation: (invitationId: string) => Promise<{ ok: boolean; message?: string }>;
  declineInvitation: (invitationId: string) => Promise<{ ok: boolean; message?: string }>;
};

type PendingInvitation = { id: string; organizationId: string; organizationName: string; role: MemberRole; expiresAt: string };

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const statusMap: Record<string, PropertyUnit["status"]> = { rented: "alugado", vacant: "vago", maintenance: "manutencao", service: "servico", negotiation: "negociacao", for_sale: "venda", sold: "vendido" };
const roleMap: Record<string, MemberRole> = { owner: "owner", admin: "admin", manager: "manager", viewer: "viewer" };

function displayName(session: Session | null, profileName?: string) {
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined;
  const raw = String(profileName || metadata?.full_name || metadata?.name || session?.user.email?.split("@")[0] || "Usuário").trim();
  return raw.split(/\s+/)[0] || "Usuário";
}

function initials(session: Session | null, profileName?: string) {
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined;
  const raw = String(profileName || metadata?.full_name || metadata?.name || session?.user.email?.split("@")[0] || "U").trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function mapPendingInvitations(data: unknown): PendingInvitation[] {
  return ((data ?? []) as Array<Record<string, unknown>>).map((invitation) => ({ id: String(invitation.id), organizationId: String(invitation.organization_id), organizationName: String(invitation.organization_name ?? "Holding"), role: roleMap[String(invitation.role)] ?? "viewer", expiresAt: String(invitation.expires_at) }));
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem("cardoso-active-organization"));
  const [value, setValue] = useState<Omit<PortfolioContextValue, "refresh" | "switchOrganization" | "acceptInvitation" | "declineInvitation">>({ organizationId: null, organizationName: "Cardoso Finance", userName: "Usuário", userInitials: "US", holdings: [], pendingInvitations: [], role: "viewer", buildings: [], expenses: [], monthlyExpenses: 0, monthlyProfit: 0, notifications: [], loading: true, error: "" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setValue((current) => ({ ...current, loading: false, error: "Supabase não configurado." })); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !session) { setValue((current) => ({ ...current, loading: false })); return; }
    setValue((current) => ({ ...current, loading: true, error: "" }));
    const invitationsResult = await supabase.rpc("list_my_invitations");
    const pendingInvitations = invitationsResult.error ? [] : mapPendingInvitations(invitationsResult.data);
    const membershipsResult = await supabase.from("organization_members").select("organization_id, role, joined_at").eq("user_id", session.user.id).order("joined_at", { ascending: true });
    if (membershipsResult.error) { setValue((current) => ({ ...current, loading: false, error: membershipsResult.error.message })); return; }
    const memberRows = (membershipsResult.data ?? []) as Array<Record<string, unknown>>;
    const memberOrganizationIds = memberRows.map((row) => String(row.organization_id));
    if (!memberOrganizationIds.length) { setValue((current) => ({ ...current, organizationId: null, holdings: [], pendingInvitations, buildings: [], expenses: [], monthlyExpenses: 0, monthlyProfit: 0, notifications: [], loading: false })); return; }
    const organizationsResult = await supabase.from("organizations").select("id, name").in("id", memberOrganizationIds);
    if (organizationsResult.error) { setValue((current) => ({ ...current, loading: false, error: organizationsResult.error.message })); return; }
    const organizationNames = new Map((organizationsResult.data ?? []).map((organization) => [String(organization.id), String(organization.name)]));
    const holdings = memberRows.map((row) => ({ id: String(row.organization_id), name: organizationNames.get(String(row.organization_id)) ?? "Holding", role: roleMap[String(row.role)] ?? "viewer" }));
    const selectedMembership = holdings.find((holding) => holding.id === activeOrganizationId) ?? holdings[0];
    const organizationId = selectedMembership.id;
    if (organizationId !== activeOrganizationId) { setActiveOrganizationId(organizationId); window.localStorage.setItem("cardoso-active-organization", organizationId); }
    const organization = await supabase.from("organizations").select("name").eq("id", organizationId).single();
    const profile = await supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
    const [assetsResult, buildingsResult, unitsResult, leasesResult, tenantsResult, expensesResult, notificationsResult] = await Promise.all([
      supabase.from("assets").select("id, name, current_value, status, source_key").eq("organization_id", organizationId),
      supabase.from("buildings").select("id, asset_id, city, state, total_units, current_value, status, source_key, notes").eq("organization_id", organizationId),
      supabase.from("property_units").select("id, building_id, code, unit_type, potential_rent, status, quantity, notes, updated_at").eq("organization_id", organizationId).order("code"),
      supabase.from("leases").select("id, unit_id, tenant_id, start_date, end_date, current_rent, next_adjustment, adjustment_frequency, adjustment_index, contract_document_url, notes, status").eq("organization_id", organizationId).in("status", ["active", "ending", "draft"]),
      supabase.from("tenants").select("id, name").eq("organization_id", organizationId),
      supabase.from("expenses").select("id, description, category, value, expense_date, competence, expense_kind, responsible, responsible_user_id, building_id").eq("organization_id", organizationId).order("expense_date", { ascending: false }),
      supabase.from("notifications").select("id, type, title, message, due_date, status, entity_id").eq("organization_id", organizationId).eq("status", "pending").order("due_date", { ascending: true }).limit(20),
    ]);
    const firstError = [assetsResult, buildingsResult, unitsResult, leasesResult, tenantsResult, expensesResult, notificationsResult].find((result) => result.error)?.error;
    if (firstError) { setValue((current) => ({ ...current, organizationId, holdings, pendingInvitations, loading: false, error: firstError.message })); return; }
    const assets = (assetsResult.data ?? []) as Array<Record<string, unknown>>;
    const buildings = (buildingsResult.data ?? []) as Array<Record<string, unknown>>;
    const units = (unitsResult.data ?? []) as Array<Record<string, unknown>>;
    const leases = (leasesResult.data ?? []) as Array<Record<string, unknown>>;
    const tenants = (tenantsResult.data ?? []) as Array<Record<string, unknown>>;
    const expenses = (expensesResult.data ?? []) as ExpenseRecord[];
    const tenantNames = new Map(tenants.map((tenant) => [String(tenant.id), String(tenant.name)]));
    const leasesByUnit = new Map<string, LeaseSummary>();
    for (const lease of leases) {
      if (!lease.unit_id) continue;
      leasesByUnit.set(String(lease.unit_id), { id: String(lease.id), tenantId: lease.tenant_id ? String(lease.tenant_id) : undefined, tenantName: lease.tenant_id ? tenantNames.get(String(lease.tenant_id)) : undefined, startDate: lease.start_date ? String(lease.start_date) : undefined, endDate: lease.end_date ? String(lease.end_date) : undefined, currentRent: Number(lease.current_rent ?? 0), nextAdjustmentDate: lease.next_adjustment ? String(lease.next_adjustment) : undefined, adjustmentFrequency: lease.adjustment_frequency ? String(lease.adjustment_frequency) : undefined, adjustmentIndex: lease.adjustment_index ? String(lease.adjustment_index) : undefined, contractDocumentUrl: lease.contract_document_url ? String(lease.contract_document_url) : undefined, notes: lease.notes ? String(lease.notes) : undefined, status: String(lease.status) });
    }
    const unitsByBuilding = new Map<string, PropertyUnit[]>();
    for (const row of units) {
      const lease = leasesByUnit.get(String(row.id));
      const list = unitsByBuilding.get(String(row.building_id)) ?? [];
      const rent = lease?.currentRent ?? Number(row.potential_rent ?? 0);
      const baseStatus = statusMap[String(row.status)] ?? "vago";
      const status = baseStatus === "venda" && rent > 0 ? "venda_alugado" : baseStatus;
      list.push({ id: String(row.id), code: String(row.code), type: String(row.unit_type ?? "Unidade"), area: 0, status, rent, tenant: lease?.tenantName, tenantName: lease?.tenantName, quantity: Number(row.quantity ?? 1), nextDue: lease?.nextAdjustmentDate, lease });
      unitsByBuilding.set(String(row.building_id), list);
    }
    const mappedBuildings: Building[] = buildings.map((row) => {
      const list = unitsByBuilding.get(String(row.id)) ?? [];
      const asset = assets.find((item) => String(item.id) === String(row.asset_id));
      const unitsTotal = list.reduce((sum, unit) => sum + (unit.quantity ?? 1), 0) || Number(row.total_units ?? 0);
      const occupied = list.reduce((sum, unit) => sum + (unit.status === "alugado" || unit.status === "venda_alugado" || unit.rent > 0 ? unit.quantity ?? 1 : 0), 0);
      return { id: String(row.source_key ?? row.id), dbId: String(row.id), assetId: asset?.id ? String(asset.id) : undefined, sourceKey: row.source_key ? String(row.source_key) : undefined, name: String(asset?.name ?? "Prédio"), city: String(row.city ?? ""), state: String(row.state ?? ""), value: Number(row.current_value ?? asset?.current_value ?? 0), units: unitsTotal, occupied, revenue: list.reduce((sum, unit) => sum + unit.rent, 0), expenses: 0, status: row.status === "for_sale" ? "venda" : "ativo", image: `db-${row.id}`, unitsData: list, sourceRows: list.length };
    });
    const profileName = profile.data?.full_name ? String(profile.data.full_name) : undefined;
    const monthlyExpenses = expenses.filter((expense) => expense.expense_kind !== "one_time").reduce((total, expense) => total + Number(expense.value || 0), 0);
    const monthlyProfit = mappedBuildings.reduce((total, building) => total + building.revenue, 0) - monthlyExpenses;
    setValue({ organizationId, organizationName: String(organization.data?.name ?? "Cardoso Finance"), userName: displayName(session, profileName), userInitials: initials(session, profileName), holdings, pendingInvitations, role: selectedMembership.role, buildings: mappedBuildings, expenses, monthlyExpenses, monthlyProfit, notifications: ((notificationsResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), type: (String(item.type) as NotificationItem["type"]), title: String(item.title), message: String(item.message), dueDate: String(item.due_date), status: String(item.status), entityId: item.entity_id ? String(item.entity_id) : undefined })), loading: false, error: "" });
  }, [activeOrganizationId, session]);

  useEffect(() => { if (session) void refresh(); else setValue((current) => ({ ...current, loading: false, organizationId: null, holdings: [], pendingInvitations: [], buildings: [], expenses: [], monthlyExpenses: 0, monthlyProfit: 0, notifications: [] })); }, [refresh, session]);
  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const result = await supabase.rpc("list_my_invitations");
      if (!result.error) setValue((current) => ({ ...current, pendingInvitations: mapPendingInvitations(result.data) }));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [session]);
  const switchOrganization = useCallback((organizationId: string) => { setActiveOrganizationId(organizationId); window.localStorage.setItem("cardoso-active-organization", organizationId); }, []);
  const acceptInvitation = useCallback(async (invitationId: string) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return { ok: false, message: "Supabase não configurado." };
    const result = await supabase.rpc("accept_invitation", { invitation_id: invitationId });
    if (result.error) return { ok: false, message: result.error.message };
    const acceptedOrganizationId = String(result.data);
    setActiveOrganizationId(acceptedOrganizationId);
    window.localStorage.setItem("cardoso-active-organization", acceptedOrganizationId);
    return { ok: true };
  }, []);
  const declineInvitation = useCallback(async (invitationId: string) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return { ok: false, message: "Supabase não configurado." };
    const result = await supabase.rpc("decline_invitation", { invitation_id: invitationId });
    if (result.error) return { ok: false, message: result.error.message };
    await refresh();
    return { ok: true };
  }, [refresh]);
  const context = useMemo(() => ({ ...value, refresh, switchOrganization, acceptInvitation, declineInvitation }), [acceptInvitation, declineInvitation, refresh, switchOrganization, value]);
  return <PortfolioContext.Provider value={context}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio precisa estar dentro de PortfolioProvider");
  return context;
}

