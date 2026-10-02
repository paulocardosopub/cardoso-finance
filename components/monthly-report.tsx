"use client";

import { CircleDollarSign, FileText, Users, X } from "lucide-react";
import type { Building, ExpenseRecord, LeasePaymentRecord, PropertyUnit } from "@/types/domain";
import { brl } from "@/lib/format";

export type ReportPaymentStatus = "paid" | "waived" | "partial" | "pending" | "overdue" | "no_lease";

export type ReportUnit = {
  id: string;
  code: string;
  type: string;
  quantity: number;
  tenant: string;
  expectedAmount: number;
  receivedAmount: number;
  dueDate?: string;
  status: ReportPaymentStatus;
};

export type ReportBuilding = {
  id: string;
  name: string;
  city: string;
  state: string;
  units: ReportUnit[];
};

export type MonthlyReportData = {
  month: string;
  monthLabel: string;
  buildings: ReportBuilding[];
  unpaidTenants: Array<ReportUnit & { buildingName: string }>;
  totalUnits: number;
  chargedUnits: number;
  paidUnits: number;
  unpaidUnits: number;
  expectedRevenue: number;
  receivedRevenue: number;
  expenses: number;
  netResult: number;
  paymentRate: number;
};

const statusLabels: Record<ReportPaymentStatus, string> = {
  paid: "Pago",
  waived: "Isento",
  partial: "Parcial",
  pending: "Pendente",
  overdue: "Atrasado",
  no_lease: "Sem locação",
};

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function activeLease(unit: PropertyUnit) {
  return Boolean(unit.lease && (unit.lease.status === "active" || unit.lease.status === "ending"));
}

function paymentStatus(unit: PropertyUnit, payment: LeasePaymentRecord | undefined, today: string): ReportPaymentStatus {
  if (!activeLease(unit)) return "no_lease";
  if (payment?.status === "waived") return "waived";
  const expected = payment?.expectedAmount || unit.lease?.currentRent || unit.rent || 0;
  if (payment?.status === "paid" || (expected > 0 && (payment?.receivedAmount ?? 0) >= expected)) return "paid";
  if (payment?.status === "overdue" || (payment?.dueDate && payment.dueDate < today)) return "overdue";
  if ((payment?.receivedAmount ?? 0) > 0 || payment?.status === "partial") return "partial";
  return "pending";
}

function paymentForMonth(unit: PropertyUnit, payments: LeasePaymentRecord[], month: string) {
  if (!unit.lease) return undefined;
  return payments.find((payment) => payment.leaseId === unit.lease?.id && payment.competence.slice(0, 7) === month);
}

export function buildMonthlyReport(buildings: Building[], payments: LeasePaymentRecord[], expenses: ExpenseRecord[], month: string): MonthlyReportData {
  const today = currentDateKey();
  const reportBuildings = buildings.map((building) => {
    const units = (building.unitsData ?? []).map((unit) => {
      const payment = paymentForMonth(unit, payments, month);
      const expectedAmount = payment?.expectedAmount || unit.lease?.currentRent || unit.rent || 0;
      return {
        id: unit.id,
        code: unit.code,
        type: unit.type,
        quantity: unit.quantity ?? 1,
        tenant: unit.tenantName || unit.tenant || "Inquilino não identificado",
        expectedAmount,
        receivedAmount: payment?.receivedAmount ?? 0,
        dueDate: payment?.dueDate,
        status: paymentStatus(unit, payment, today),
      } satisfies ReportUnit;
    });
    return { id: building.id, name: building.name, city: building.city, state: building.state, units } satisfies ReportBuilding;
  });
  const allUnits = reportBuildings.flatMap((building) => building.units);
  const chargedUnits = allUnits.filter((unit) => unit.status !== "no_lease");
  const paidUnits = chargedUnits.filter((unit) => unit.status === "paid" || unit.status === "waived");
  const unpaidTenants = chargedUnits.filter((unit) => unit.status !== "paid" && unit.status !== "waived").map((unit) => ({ ...unit, buildingName: reportBuildings.find((building) => building.units.some((buildingUnit) => buildingUnit.id === unit.id))?.name ?? "Imóvel" }));
  const expectedRevenue = chargedUnits.reduce((total, unit) => total + unit.expectedAmount, 0);
  const receivedRevenue = chargedUnits.reduce((total, unit) => total + unit.receivedAmount, 0);
  const monthExpenses = expenses.filter((expense) => expense.competence?.slice(0, 7) === month || expense.expense_date?.slice(0, 7) === month).reduce((total, expense) => total + Number(expense.value || 0), 0);

  return {
    month,
    monthLabel: monthLabel(month),
    buildings: reportBuildings,
    unpaidTenants,
    totalUnits: allUnits.length,
    chargedUnits: chargedUnits.length,
    paidUnits: paidUnits.length,
    unpaidUnits: unpaidTenants.length,
    expectedRevenue,
    receivedRevenue,
    expenses: monthExpenses,
    netResult: receivedRevenue - monthExpenses,
    paymentRate: expectedRevenue > 0 ? Math.min(100, Math.round((receivedRevenue / expectedRevenue) * 100)) : 0,
  };
}

function dateLabel(value?: string) {
  if (!value) return "Sem vencimento";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

export function MonthlyReport({ report, onClose }: { report: MonthlyReportData; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="monthly-report-title">
      <div className="report-modal-heading">
        <div>
          <div className="eyebrow"><FileText size={13} /> Report mensal</div>
          <h2 id="monthly-report-title">Report geral · {report.monthLabel}</h2>
          <p>Visão consolidada dos imóveis, unidades, recebimentos e pendências da competência selecionada.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar report"><X size={18} /></button>
      </div>

      <div className="report-summary-grid">
        <ReportMetric label="Recebido no mês" value={brl(report.receivedRevenue)} detail={`de ${brl(report.expectedRevenue)} previsto`} tone="positive" icon={<CircleDollarSign size={15} />} />
        <ReportMetric label="Pagamento recebido" value={`${report.paymentRate}%`} detail={`${report.paidUnits} de ${report.chargedUnits} cobranças pagas`} tone="positive" icon={<CircleDollarSign size={15} />} />
        <ReportMetric label="Despesas registradas" value={brl(report.expenses)} detail="Na competência selecionada" icon={<FileText size={15} />} />
        <ReportMetric label="Inquilinos pendentes" value={String(report.unpaidUnits)} detail="Sem pagamento integral" tone={report.unpaidUnits ? "negative" : "positive"} icon={<Users size={15} />} />
      </div>

      <section className="report-section">
        <div className="report-section-heading"><div><h3>Prédios, imóveis e unidades</h3><p>{report.buildings.length} imóveis · {report.totalUnits} unidades cadastradas · {report.chargedUnits} com cobrança no mês</p></div></div>
        {report.buildings.length ? <div className="report-building-list">{report.buildings.map((building) => <div className="report-building" key={building.id}>
          <div className="report-building-heading"><div><strong>{building.name}</strong><small>{[building.city, building.state].filter(Boolean).join(" · ") || "Localização não informada"}</small></div><span>{building.units.length} unidade{building.units.length === 1 ? "" : "s"}</span></div>
          {building.units.length ? <div className="table-wrap"><table className="report-table"><thead><tr><th>Unidade</th><th>Inquilino</th><th>Previsto</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{building.units.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.type}{unit.quantity > 1 ? ` · ${unit.quantity} unidades` : ""}</small></td><td>{unit.status === "no_lease" ? "—" : unit.tenant}</td><td>{unit.status === "no_lease" ? "—" : brl(unit.expectedAmount)}</td><td>{unit.status === "no_lease" ? "—" : brl(unit.receivedAmount)}</td><td><span className={`report-status report-status-${unit.status}`}>{statusLabels[unit.status]}</span>{unit.status !== "no_lease" && <small>{unit.status === "paid" || unit.status === "waived" ? "Competência quitada" : dateLabel(unit.dueDate)}</small>}</td></tr>)}</tbody></table></div> : <p className="report-empty-line">Nenhuma unidade cadastrada neste imóvel.</p>}
        </div>)}</div> : <div className="empty-state report-empty"><FileText size={28} /><h3>Nenhum imóvel encontrado</h3><p>Não há imóveis disponíveis para esta organização.</p></div>}
      </section>

      <section className="report-section">
        <div className="report-section-heading"><div><h3>Inquilinos que não pagaram</h3><p>Inclui cobranças pendentes, parciais, atrasadas ou ainda não geradas.</p></div><span className={report.unpaidUnits ? "negative" : "positive"}>{report.unpaidUnits} pendência{report.unpaidUnits === 1 ? "" : "s"}</span></div>
        {report.unpaidTenants.length ? <div className="table-wrap"><table className="report-table report-unpaid-table"><thead><tr><th>Inquilino</th><th>Imóvel / unidade</th><th>Vencimento</th><th>Em aberto</th><th>Status</th></tr></thead><tbody>{report.unpaidTenants.map((unit) => <tr key={`${unit.buildingName}-${unit.id}`}><td><strong>{unit.tenant}</strong></td><td>{unit.buildingName}<small>{unit.code}</small></td><td>{dateLabel(unit.dueDate)}</td><td className="negative"><strong>{brl(Math.max(0, unit.expectedAmount - unit.receivedAmount))}</strong><small>de {brl(unit.expectedAmount)}</small></td><td><span className={`report-status report-status-${unit.status}`}>{statusLabels[unit.status]}</span></td></tr>)}</tbody></table></div> : <div className="report-success"><Users size={19} /><div><strong>Nenhuma pendência identificada</strong><p>Todos os inquilinos com cobrança no mês estão pagos ou isentos.</p></div></div>}
      </section>

      <div className="report-modal-footer"><span>Resultado líquido recebido − despesas: <strong className={report.netResult < 0 ? "negative" : "positive"}>{brl(report.netResult)}</strong></span><button type="button" className="button button-ghost" onClick={onClose}>Fechar report</button></div>
    </section>
  </div>;
}

function ReportMetric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "positive" | "negative" }) {
  return <div className="report-metric"><div className="report-metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className={tone ?? ""}>{value}</strong><small>{detail}</small></div>;
}
