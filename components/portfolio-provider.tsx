"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { initialBuildings } from "@/lib/initial-property-data";
import type { Building, LeaseSummary, MemberRole, NotificationItem, PropertyUnit } from "@/types/domain";

type PortfolioContextValue = {
  organizationId: string | null;
  organizationName: string;
  role: MemberRole;
  buildings: Building[];
  notifications: NotificationItem[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const statusMap: Record<string, PropertyUnit["status"]> = { rented: "alugado", vacant: "vago", maintenance: "manutencao", negotiation: "negociacao", for_sale: "venda", sold: "vendido" };
const roleMap: Record<string, MemberRole> = { owner: "owner", admin: "admin", manager: "manager", viewer: "viewer" };

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [value, setValue] = useState<Omit<PortfolioContextValue, "refresh">>({ organizationId: null, organizationName: "Cardoso Finance", role: "viewer", buildings: [], notifications: [], loading: true, error: "" });

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
    const membership = await supabase.from("organization_members").select("organization_id, role").eq("user_id", session.user.id).order("joined_at", { ascending: true }).limit(1).maybeSingle();
    if (membership.error) { setValue((current) => ({ ...current, loading: false, error: membership.error.message })); return; }
    if (!membership.data) { setValue((current) => ({ ...current, organizationId: null, buildings: [], notifications: [], loading: false })); return; }
    const organizationId = membership.data.organization_id as string;
    const organization = await supabase.from("organizations").select("name").eq("id", organizationId).single();
    const [assetsResult, buildingsResult, unitsResult, leasesResult, tenantsResult, notificationsResult] = await Promise.all([
      supabase.from("assets").select("id, name, current_value, status, source_key").eq("organization_id", organizationId),
      supabase.from("buildings").select("id, asset_id, city, state, total_units, current_value, status, source_key, notes").eq("organization_id", organizationId),
      supabase.from("property_units").select("id, building_id, code, unit_type, potential_rent, status, quantity, notes, updated_at").eq("organization_id", organizationId).order("code"),
      supabase.from("leases").select("id, unit_id, tenant_id, start_date, end_date, current_rent, next_adjustment, adjustment_frequency, adjustment_index, notes, status").eq("organization_id", organizationId).in("status", ["active", "ending", "draft"]),
      supabase.from("tenants").select("id, name").eq("organization_id", organizationId),
      supabase.from("notifications").select("id, type, title, message, due_date, status, entity_id").eq("organization_id", organizationId).eq("status", "pending").order("due_date", { ascending: true }).limit(20),
    ]);
    const firstError = [assetsResult, buildingsResult, unitsResult, leasesResult, tenantsResult, notificationsResult].find((result) => result.error)?.error;
    if (firstError) { setValue((current) => ({ ...current, organizationId, loading: false, error: firstError.message })); return; }
    const assets = (assetsResult.data ?? []) as Array<Record<string, unknown>>;
    const buildings = (buildingsResult.data ?? []) as Array<Record<string, unknown>>;
    const units = (unitsResult.data ?? []) as Array<Record<string, unknown>>;
    const leases = (leasesResult.data ?? []) as Array<Record<string, unknown>>;
    const tenants = (tenantsResult.data ?? []) as Array<Record<string, unknown>>;
    const tenantNames = new Map(tenants.map((tenant) => [String(tenant.id), String(tenant.name)]));
    const leasesByUnit = new Map<string, LeaseSummary>();
    for (const lease of leases) {
      if (!lease.unit_id) continue;
      leasesByUnit.set(String(lease.unit_id), { id: String(lease.id), tenantId: lease.tenant_id ? String(lease.tenant_id) : undefined, tenantName: lease.tenant_id ? tenantNames.get(String(lease.tenant_id)) : undefined, startDate: lease.start_date ? String(lease.start_date) : undefined, endDate: lease.end_date ? String(lease.end_date) : undefined, currentRent: Number(lease.current_rent ?? 0), nextAdjustmentDate: lease.next_adjustment ? String(lease.next_adjustment) : undefined, adjustmentFrequency: lease.adjustment_frequency ? String(lease.adjustment_frequency) : undefined, adjustmentIndex: lease.adjustment_index ? String(lease.adjustment_index) : undefined, notes: lease.notes ? String(lease.notes) : undefined, status: String(lease.status) });
    }
    const unitsByBuilding = new Map<string, PropertyUnit[]>();
    for (const row of units) {
      const lease = leasesByUnit.get(String(row.id));
      const list = unitsByBuilding.get(String(row.building_id)) ?? [];
      list.push({ id: String(row.id), code: String(row.code), type: String(row.unit_type ?? "Unidade"), area: 0, status: statusMap[String(row.status)] ?? "vago", rent: lease?.currentRent ?? Number(row.potential_rent ?? 0), tenant: lease?.tenantName, tenantName: lease?.tenantName, quantity: Number(row.quantity ?? 1), nextDue: lease?.nextAdjustmentDate, lease });
      unitsByBuilding.set(String(row.building_id), list);
    }
    const mappedBuildings: Building[] = buildings.map((row) => {
      const list = unitsByBuilding.get(String(row.id)) ?? [];
      const asset = assets.find((item) => String(item.id) === String(row.asset_id));
      const unitsTotal = list.reduce((sum, unit) => sum + (unit.quantity ?? 1), 0) || Number(row.total_units ?? 0);
      const occupied = list.reduce((sum, unit) => sum + (unit.status === "alugado" ? unit.quantity ?? 1 : 0), 0);
      return { id: String(row.source_key ?? row.id), dbId: String(row.id), sourceKey: row.source_key ? String(row.source_key) : undefined, name: String(asset?.name ?? "Prédio"), city: String(row.city ?? ""), state: String(row.state ?? ""), value: Number(row.current_value ?? asset?.current_value ?? 0), units: unitsTotal, occupied, revenue: list.reduce((sum, unit) => sum + unit.rent, 0), expenses: 0, status: row.status === "for_sale" ? "venda" : "ativo", image: `db-${row.id}`, unitsData: list, sourceRows: list.length };
    });
    setValue({ organizationId, organizationName: String(organization.data?.name ?? "Cardoso Finance"), role: roleMap[String(membership.data.role)] ?? "viewer", buildings: mappedBuildings, notifications: ((notificationsResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), type: (String(item.type) as NotificationItem["type"]), title: String(item.title), message: String(item.message), dueDate: String(item.due_date), status: String(item.status), entityId: item.entity_id ? String(item.entity_id) : undefined })), loading: false, error: "" });
  }, [session]);

  useEffect(() => { if (session) void refresh(); else setValue((current) => ({ ...current, loading: false, organizationId: null })); }, [refresh, session]);
  const context = useMemo(() => ({ ...value, refresh }), [refresh, value]);
  return <PortfolioContext.Provider value={context}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio precisa estar dentro de PortfolioProvider");
  return context;
}

export function initialFallbackBuildings() { return initialBuildings; }
