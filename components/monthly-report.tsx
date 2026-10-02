"use client";

import { useState } from "react";
import { CircleDollarSign, Download, FileText, Users, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Building, ExpenseRecord, LeasePaymentRecord, PropertyUnit } from "@/types/domain";
import { leaseActiveInMonth } from "@/lib/month";
import { brl } from "@/lib/format";

export type ReportPaymentStatus = "paid" | "waived" | "partial" | "pending" | "overdue" | "no_lease";
export type ReportCategory = "summary" | "properties" | "unpaid";
export type ReportCategorySelection = Record<ReportCategory, boolean>;

export const defaultReportCategories: ReportCategorySelection = { summary: true, properties: true, unpaid: true };

const categoryOptions: Array<{ id: ReportCategory; label: string; description: string }> = [
  { id: "summary", label: "Resumo geral", description: "Recebimentos, despesas, taxa de pagamento e resultado líquido." },
  { id: "properties", label: "Prédios, imóveis e unidades", description: "Unidades, inquilinos e status de pagamento por imóvel." },
  { id: "unpaid", label: "Inquilinos que não pagaram", description: "Pendências agrupadas por inquilino na competência escolhida." },
];

export type ReportUnit = {
  id: string;
  code: string;
  type: string;
  quantity: number;
  tenant: string;
  tenantId?: string;
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

export type ReportUnpaidTenant = {
  id: string;
  tenant: string;
  units: string[];
  expectedAmount: number;
  receivedAmount: number;
  dueDates: string[];
  status: Exclude<ReportPaymentStatus, "no_lease" | "paid" | "waived">;
};

export type MonthlyReportData = {
  month: string;
  monthLabel: string;
  buildings: ReportBuilding[];
  unpaidTenants: ReportUnpaidTenant[];
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

function activeLease(unit: PropertyUnit, month: string) {
  return Boolean(unit.lease && (unit.lease.status === "active" || unit.lease.status === "ending") && leaseActiveInMonth(unit.lease, month));
}

function paymentStatus(unit: PropertyUnit, payment: LeasePaymentRecord | undefined, month: string, today: string): ReportPaymentStatus {
  if (!activeLease(unit, month)) return "no_lease";
  if (payment?.status === "waived") return "waived";
  const expected = payment?.expectedAmount || unit.lease?.currentRent || unit.rent || 0;
  if (payment?.status === "paid" || (expected > 0 && (payment?.receivedAmount ?? 0) >= expected)) return "paid";
  if (payment?.status === "overdue" || (payment?.dueDate && payment.dueDate < today)) return "overdue";
  if ((payment?.receivedAmount ?? 0) > 0 || payment?.status === "partial") return "partial";
  return "pending";
}

function paymentForMonth(unit: PropertyUnit, payments: LeasePaymentRecord[], month: string) {
  if (!unit.lease || !activeLease(unit, month)) return undefined;
  return payments.find((payment) => payment.leaseId === unit.lease?.id && payment.competence.slice(0, 7) === month);
}

function unpaidStatus(current: ReportUnpaidTenant["status"], next: ReportPaymentStatus): ReportUnpaidTenant["status"] {
  if (next === "overdue") return "overdue";
  if (current === "overdue") return current;
  if (next === "partial") return "partial";
  if (current === "partial") return current;
  return "pending";
}

function tenantKey(unit: ReportUnit) {
  return unit.tenantId || `name:${unit.tenant.trim().toLocaleLowerCase("pt-BR")}`;
}

export function buildMonthlyReport(buildings: Building[], payments: LeasePaymentRecord[], expenses: ExpenseRecord[], month: string): MonthlyReportData {
  const today = currentDateKey();
  const reportBuildings = buildings.map((building) => {
    const units = (building.unitsData ?? []).map((unit) => {
      const isActive = activeLease(unit, month);
      const payment = paymentForMonth(unit, payments, month);
      const expectedAmount = isActive ? payment?.expectedAmount || unit.lease?.currentRent || unit.rent || 0 : 0;
      return {
        id: unit.id,
        code: unit.code,
        type: unit.type,
        quantity: unit.quantity ?? 1,
        tenant: unit.tenantName || unit.tenant || "Inquilino não identificado",
        tenantId: unit.lease?.tenantId,
        expectedAmount,
        receivedAmount: isActive ? payment?.receivedAmount ?? 0 : 0,
        dueDate: isActive ? payment?.dueDate : undefined,
        status: paymentStatus(unit, payment, month, today),
      } satisfies ReportUnit;
    });
    return { id: building.id, name: building.name, city: building.city, state: building.state, units } satisfies ReportBuilding;
  });
  const allUnits = reportBuildings.flatMap((building) => building.units);
  const chargedUnits = allUnits.filter((unit) => unit.status !== "no_lease");
  const paidUnits = chargedUnits.filter((unit) => unit.status === "paid" || unit.status === "waived");
  const unpaidRows = reportBuildings.flatMap((building) => building.units.filter((unit) => unit.status !== "no_lease" && unit.status !== "paid" && unit.status !== "waived").map((unit) => ({ unit, building })));
  const unpaidByTenant = new Map<string, ReportUnpaidTenant>();
  for (const { unit, building } of unpaidRows) {
    const key = tenantKey(unit);
    const existing = unpaidByTenant.get(key);
    if (existing) {
      existing.units.push(`${building.name} - ${unit.code}`);
      existing.expectedAmount += unit.expectedAmount;
      existing.receivedAmount += unit.receivedAmount;
      if (unit.dueDate) existing.dueDates.push(unit.dueDate);
      existing.status = unpaidStatus(existing.status, unit.status);
    } else {
      unpaidByTenant.set(key, { id: key, tenant: unit.tenant, units: [`${building.name} - ${unit.code}`], expectedAmount: unit.expectedAmount, receivedAmount: unit.receivedAmount, dueDates: unit.dueDate ? [unit.dueDate] : [], status: unit.status as ReportUnpaidTenant["status"] });
    }
  }
  const unpaidTenants = Array.from(unpaidByTenant.values());
  const expectedRevenue = chargedUnits.reduce((total, unit) => total + unit.expectedAmount, 0);
  const receivedRevenue = chargedUnits.reduce((total, unit) => total + unit.receivedAmount, 0);
  const monthExpenses = expenses.filter((expense) => expense.competence?.slice(0, 7) === month || expense.expense_date?.slice(0, 7) === month).reduce((total, expense) => total + Number(expense.value || 0), 0);

  return { month, monthLabel: monthLabel(month), buildings: reportBuildings, unpaidTenants, totalUnits: allUnits.length, chargedUnits: chargedUnits.length, paidUnits: paidUnits.length, unpaidUnits: unpaidRows.length, expectedRevenue, receivedRevenue, expenses: monthExpenses, netResult: receivedRevenue - monthExpenses, paymentRate: expectedRevenue > 0 ? Math.min(100, Math.round((receivedRevenue / expectedRevenue) * 100)) : 0 };
}

function dateLabel(value?: string) {
  if (!value) return "Sem vencimento";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function hasCategory(categories: ReportCategorySelection, category: ReportCategory) {
  return categories[category];
}

function pdfText(value: string) {
  return value.replace(/[·−—]/g, "-");
}

type PdfDocument = jsPDF & { lastAutoTable?: { finalY: number } };

export function downloadMonthlyReportPdf(report: MonthlyReportData, categories: ReportCategorySelection) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as PdfDocument;
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursor = 17;
  doc.setTextColor(25, 34, 48);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfText(`Report geral - ${report.monthLabel}`), margin, cursor);
  cursor += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(95, 106, 124);
  doc.text("Cardoso Finance - dados da competência selecionada", margin, cursor);
  cursor += 10;
  const pageFooter = () => {
    const height = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 142);
    doc.text("Cardoso Finance", margin, height - 9);
    doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - margin, height - 9, { align: "right" });
  };
  const sectionTitle = (title: string) => {
    if (cursor > 267) { doc.addPage(); cursor = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(25, 34, 48);
    doc.text(pdfText(title), margin, cursor);
    cursor += 5;
  };
  const table = (head: string[], body: string[][]) => {
    autoTable(doc, { startY: cursor, margin: { left: margin, right: margin }, head: [head.map(pdfText)], body: body.map((row) => row.map(pdfText)), theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, textColor: [55, 64, 78], overflow: "linebreak" }, headStyles: { fillColor: [23, 30, 43], textColor: [255, 255, 255], fontStyle: "bold" }, alternateRowStyles: { fillColor: [245, 248, 251] }, didDrawPage: pageFooter });
    cursor = (doc.lastAutoTable?.finalY ?? cursor) + 9;
  };
  if (hasCategory(categories, "summary")) {
    sectionTitle("Resumo geral");
    table(["Indicador", "Resultado"], [["Recebido no mês", `${brl(report.receivedRevenue)} de ${brl(report.expectedRevenue)} previsto`], ["Taxa de pagamento", `${report.paymentRate}% (${report.paidUnits} de ${report.chargedUnits} cobranças pagas)`], ["Despesas registradas", brl(report.expenses)], ["Inquilinos pendentes", String(report.unpaidTenants.length)], ["Resultado líquido", brl(report.netResult)]]);
  }
  if (hasCategory(categories, "properties")) {
    sectionTitle("Prédios, imóveis e unidades");
    for (const building of report.buildings) {
      if (cursor > 258) { doc.addPage(); cursor = 18; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(54, 66, 83);
      doc.text(pdfText(`${building.name}${building.city ? ` - ${building.city}${building.state ? `/${building.state}` : ""}` : ""}`), margin, cursor);
      cursor += 4;
      table(["Unidade", "Inquilino", "Previsto", "Recebido", "Status"], building.units.map((unit) => [unit.code, unit.status === "no_lease" ? "-" : unit.tenant, unit.status === "no_lease" ? "-" : brl(unit.expectedAmount), unit.status === "no_lease" ? "-" : brl(unit.receivedAmount), statusLabels[unit.status]]));
    }
  }
  if (hasCategory(categories, "unpaid")) {
    sectionTitle("Inquilinos que não pagaram");
    table(["Inquilino", "Imóvel / unidade", "Vencimento", "Em aberto", "Status"], report.unpaidTenants.length ? report.unpaidTenants.map((tenant) => [tenant.tenant, tenant.units.join("; "), tenant.dueDates.length ? tenant.dueDates.map(dateLabel).join(", ") : "Sem vencimento", brl(Math.max(0, tenant.expectedAmount - tenant.receivedAmount)), statusLabels[tenant.status]]) : [["Nenhuma pendência", "-", "-", brl(0), "Pago ou isento"]]);
  }
  if (doc.getNumberOfPages() === 1) pageFooter();
  doc.save(`report-${report.month}.pdf`);
}

export function ReportRequestDialog({ initialMonth, onClose, onGenerate }: { initialMonth: string; onClose: () => void; onGenerate: (month: string, categories: ReportCategorySelection, download: boolean) => void }) {
  const [month, setMonth] = useState(initialMonth);
  const [categories, setCategories] = useState<ReportCategorySelection>({ ...defaultReportCategories });
  const selectedCount = Object.values(categories).filter(Boolean).length;
  const toggleCategory = (category: ReportCategory) => setCategories((current) => selectedCount === 1 && current[category] ? current : { ...current, [category]: !current[category] });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="report-request-modal" role="dialog" aria-modal="true" aria-labelledby="report-request-title">
      <div className="report-modal-heading"><div><div className="eyebrow"><FileText size={13} /> Solicitar report</div><h2 id="report-request-title">Monte seu report mensal</h2><p>Escolha a competência e marque as informações que deseja receber.</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar solicitação"><X size={18} /></button></div>
      <div className="report-request-form"><label htmlFor="report-request-month">Mês de referência<input id="report-request-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><div><span className="report-category-label">Categorias do report</span><div className="report-category-list">{categoryOptions.map((category) => <label className="report-category-option" key={category.id}><input type="checkbox" checked={categories[category.id]} onChange={() => toggleCategory(category.id)} /><span><strong>{category.label}</strong><small>{category.description}</small></span></label>)}</div></div></div>
      <div className="report-modal-footer"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><div className="report-request-actions"><button type="button" className="button button-ghost" onClick={() => onGenerate(month, categories, false)} disabled={!month || selectedCount === 0}><FileText size={14} /> Visualizar</button><button type="button" className="button button-primary" onClick={() => onGenerate(month, categories, true)} disabled={!month || selectedCount === 0}><Download size={14} /> Baixar PDF</button></div></div>
    </section>
  </div>;
}

export function MonthlyReport({ report, categories, onClose }: { report: MonthlyReportData; categories: ReportCategorySelection; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="monthly-report-title">
      <div className="report-modal-heading"><div><div className="eyebrow"><FileText size={13} /> Report mensal</div><h2 id="monthly-report-title">Report geral · {report.monthLabel}</h2><p>Visão consolidada das informações marcadas na solicitação.</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar report"><X size={18} /></button></div>
      {hasCategory(categories, "summary") && <div className="report-summary-grid"><ReportMetric label="Recebido no mês" value={brl(report.receivedRevenue)} detail={`de ${brl(report.expectedRevenue)} previsto`} tone="positive" icon={<CircleDollarSign size={15} />} /><ReportMetric label="Pagamento recebido" value={`${report.paymentRate}%`} detail={`${report.paidUnits} de ${report.chargedUnits} cobranças pagas`} tone="positive" icon={<CircleDollarSign size={15} />} /><ReportMetric label="Despesas registradas" value={brl(report.expenses)} detail="Na competência selecionada" icon={<FileText size={15} />} /><ReportMetric label="Inquilinos pendentes" value={String(report.unpaidTenants.length)} detail={`${report.unpaidUnits} unidade${report.unpaidUnits === 1 ? "" : "s"} sem quitação integral`} tone={report.unpaidTenants.length ? "negative" : "positive"} icon={<Users size={15} />} /></div>}
      {hasCategory(categories, "properties") && <section className="report-section"><div className="report-section-heading"><div><h3>Prédios, imóveis e unidades</h3><p>{report.buildings.length} imóveis · {report.totalUnits} unidades cadastradas · {report.chargedUnits} com cobrança no mês</p></div></div>{report.buildings.length ? <div className="report-building-list">{report.buildings.map((building) => <div className="report-building" key={building.id}><div className="report-building-heading"><div><strong>{building.name}</strong><small>{[building.city, building.state].filter(Boolean).join(" · ") || "Localização não informada"}</small></div><span>{building.units.length} unidade{building.units.length === 1 ? "" : "s"}</span></div>{building.units.length ? <div className="table-wrap"><table className="report-table"><thead><tr><th>Unidade</th><th>Inquilino</th><th>Previsto</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{building.units.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.type}{unit.quantity > 1 ? ` · ${unit.quantity} unidades` : ""}</small></td><td>{unit.status === "no_lease" ? "-" : unit.tenant}</td><td>{unit.status === "no_lease" ? "-" : brl(unit.expectedAmount)}</td><td>{unit.status === "no_lease" ? "-" : brl(unit.receivedAmount)}</td><td><span className={`report-status report-status-${unit.status}`}>{statusLabels[unit.status]}</span>{unit.status !== "no_lease" && <small>{unit.status === "paid" || unit.status === "waived" ? "Competência quitada" : dateLabel(unit.dueDate)}</small>}</td></tr>)}</tbody></table></div> : <p className="report-empty-line">Nenhuma unidade cadastrada neste imóvel.</p>}</div>)}</div> : <div className="empty-state report-empty"><FileText size={28} /><h3>Nenhum imóvel encontrado</h3><p>Não há imóveis disponíveis para esta organização.</p></div>}</section>}
      {hasCategory(categories, "unpaid") && <section className="report-section"><div className="report-section-heading"><div><h3>Inquilinos que não pagaram</h3><p>Pendências agrupadas por inquilino, sem duplicar quem ocupa mais de uma unidade.</p></div><span className={report.unpaidTenants.length ? "negative" : "positive"}>{report.unpaidTenants.length} pendência{report.unpaidTenants.length === 1 ? "" : "s"}</span></div>{report.unpaidTenants.length ? <div className="table-wrap"><table className="report-table report-unpaid-table"><thead><tr><th>Inquilino</th><th>Imóvel / unidade</th><th>Vencimento</th><th>Em aberto</th><th>Status</th></tr></thead><tbody>{report.unpaidTenants.map((tenant) => <tr key={tenant.id}><td><strong>{tenant.tenant}</strong></td><td>{tenant.units.join("; ")}</td><td>{tenant.dueDates.length ? tenant.dueDates.map(dateLabel).join(", ") : "Sem vencimento"}</td><td className="negative"><strong>{brl(Math.max(0, tenant.expectedAmount - tenant.receivedAmount))}</strong><small>de {brl(tenant.expectedAmount)}</small></td><td><span className={`report-status report-status-${tenant.status}`}>{statusLabels[tenant.status]}</span></td></tr>)}</tbody></table></div> : <div className="report-success"><Users size={19} /><div><strong>Nenhuma pendência identificada</strong><p>Todos os inquilinos com cobrança no mês estão pagos ou isentos.</p></div></div>}</section>}
      <div className="report-modal-footer">{hasCategory(categories, "summary") && <span>Resultado líquido recebido - despesas: <strong className={report.netResult < 0 ? "negative" : "positive"}>{brl(report.netResult)}</strong></span>}<div className="report-request-actions"><button type="button" className="button button-ghost" onClick={() => downloadMonthlyReportPdf(report, categories)}><Download size={14} /> Baixar PDF</button><button type="button" className="button button-ghost" onClick={onClose}>Fechar report</button></div></div>
    </section>
  </div>;
}

function ReportMetric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "positive" | "negative" }) {
  return <div className="report-metric"><div className="report-metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className={tone ?? ""}>{value}</strong><small>{detail}</small></div>;
}
