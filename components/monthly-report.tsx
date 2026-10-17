"use client";

import { useState } from "react";
import { CircleDollarSign, Download, FileText, Users, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Building, ExpenseRecord, LeasePaymentRecord, PropertyUnit } from "@/types/domain";
import { unitRentActiveInMonth } from "@/lib/month";
import { brl } from "@/lib/format";
import { buildingIsForSale } from "@/lib/building-order";

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
  forSale: boolean;
  nearSale: boolean;
  units: ReportUnit[];
  totalUnits: number;
  occupiedUnits: number;
  expectedAmount: number;
  receivedAmount: number;
  paymentRate: number;
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
  occupiedUnits: number;
  occupancyRate: number;
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
  return unitRentActiveInMonth(unit, month);
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
    const totalUnits = units.reduce((total, unit) => total + Math.max(1, unit.quantity || 1), 0);
    const occupiedUnits = units.filter((unit) => unit.status !== "no_lease").reduce((total, unit) => total + Math.max(1, unit.quantity || 1), 0);
    const expectedAmount = units.reduce((total, unit) => total + unit.expectedAmount, 0);
    const receivedAmount = units.reduce((total, unit) => total + unit.receivedAmount, 0);
    return { id: building.id, name: building.name, city: building.city, state: building.state, forSale: buildingIsForSale(building), nearSale: Boolean(building.saleProximity), units, totalUnits, occupiedUnits, expectedAmount, receivedAmount, paymentRate: expectedAmount > 0 ? Math.min(100, Math.round((receivedAmount / expectedAmount) * 100)) : 0 } satisfies ReportBuilding;
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
  const occupiedUnits = allUnits.filter((unit) => unit.status !== "no_lease").reduce((total, unit) => total + Math.max(1, unit.quantity || 1), 0);
  const totalUnitCount = allUnits.reduce((total, unit) => total + Math.max(1, unit.quantity || 1), 0);
  const monthExpenses = expenses.filter((expense) => expense.competence?.slice(0, 7) === month || expense.expense_date?.slice(0, 7) === month).reduce((total, expense) => total + Number(expense.value || 0), 0);

  return { month, monthLabel: monthLabel(month), buildings: reportBuildings, unpaidTenants, totalUnits: totalUnitCount, occupiedUnits, occupancyRate: totalUnitCount > 0 ? Math.round((occupiedUnits / totalUnitCount) * 100) : 0, chargedUnits: chargedUnits.length, paidUnits: paidUnits.length, unpaidUnits: unpaidRows.length, expectedRevenue, receivedRevenue, expenses: monthExpenses, netResult: receivedRevenue - monthExpenses, paymentRate: expectedRevenue > 0 ? Math.min(100, Math.round((receivedRevenue / expectedRevenue) * 100)) : 0 };
}

function dateLabel(value?: string) {
  if (!value) return "Sem vencimento";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function hasCategory(categories: ReportCategorySelection, category: ReportCategory) {
  return categories[category];
}

function pdfText(value: string) {
  return value.replace(/[·−—]/g, "-").replace(/…/g, "...");
}

function reportFileName(month: string) {
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(`${month}-01T12:00:00`));
  const normalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const safeMonth = normalizedMonth.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `Report_CardosoFinance_${safeMonth}${month.slice(2, 4)}.pdf`;
}

function propertyHighlightLabels(building: Pick<ReportBuilding, "forSale" | "nearSale">) {
  return [building.forSale ? "À venda" : "", building.nearSale ? "Próximo de vender" : ""].filter(Boolean);
}

type PdfDocument = jsPDF & { lastAutoTable?: { finalY: number } };

export function downloadMonthlyReportPdf(report: MonthlyReportData, categories: ReportCategorySelection) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as PdfDocument;
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const colors = {
    bg: [8, 14, 24] as [number, number, number],
    surface: [17, 27, 41] as [number, number, number],
    surfaceAlt: [24, 37, 54] as [number, number, number],
    line: [47, 64, 84] as [number, number, number],
    text: [239, 246, 250] as [number, number, number],
    muted: [151, 168, 188] as [number, number, number],
    green: [128, 226, 176] as [number, number, number],
    blue: [98, 182, 255] as [number, number, number],
    amber: [240, 190, 74] as [number, number, number],
    red: [255, 140, 140] as [number, number, number],
  };
  let cursor = 53;
  const setFill = (color: [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
  const setStroke = (color: [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);
  const setText = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
  const shortText = (value: string, max = 28) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
  const drawBackground = () => { setFill(colors.bg); doc.rect(0, 0, pageWidth, pageHeight, "F"); };
  const drawSmallHeader = () => {
    setFill(colors.green); doc.roundedRect(margin, 10, 10, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setText(colors.bg); doc.text("CF", margin + 5, 16.4, { align: "center" });
    setText(colors.text); doc.setFontSize(9); doc.text("CARDOSO FINANCE", margin + 14, 16.5);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(pdfText(report.monthLabel), pageWidth - margin, 16.5, { align: "right" });
  };
  const drawFooter = (pageNumber: number) => {
    setStroke(colors.line); doc.setLineWidth(.25); doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text("Cardoso Finance · relatório gerencial", margin, pageHeight - 8); doc.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  };
  const newPage = () => { doc.addPage(); drawBackground(); drawSmallHeader(); cursor = 25; };
  const ensureSpace = (height: number) => { if (cursor + height > pageHeight - 20) newPage(); };
  const sectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 13 : 9);
    setFill(colors.green); doc.roundedRect(margin, cursor - 4, 3, subtitle ? 12 : 8, 1.2, 1.2, "F");
    setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(pdfText(title), margin + 8, cursor + 2);
    if (subtitle) { setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(pdfText(subtitle), margin + 8, cursor + 8); cursor += 17; } else cursor += 12;
  };
  const metricCard = (x: number, y: number, width: number, label: string, value: string, detail: string, color: [number, number, number]) => {
    setFill(colors.surface); setStroke(colors.line); doc.setLineWidth(.3); doc.roundedRect(x, y, width, 29, 3, 3, "FD");
    setFill(color); doc.roundedRect(x, y, width, 2.2, 1.2, 1.2, "F");
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(pdfText(label), x + 6, y + 9);
    setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(pdfText(value), x + 6, y + 19);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text(pdfText(detail), x + 6, y + 25);
  };
  const progressCard = (x: number, y: number, width: number, label: string, value: number, detail: string, color: [number, number, number]) => {
    setFill(colors.surface); setStroke(colors.line); doc.roundedRect(x, y, width, 32, 3, 3, "FD");
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(pdfText(label), x + 7, y + 9);
    setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(`${value}%`, x + 7, y + 19);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text(pdfText(detail), x + 31, y + 18.5);
    setFill(colors.surfaceAlt); doc.roundedRect(x + 7, y + 24, width - 14, 3, 1.5, 1.5, "F");
    setFill(color); doc.roundedRect(x + 7, y + 24, Math.max(1, (width - 14) * Math.min(100, Math.max(0, value)) / 100), 3, 1.5, 1.5, "F");
  };
  const lineChart = () => {
    const units = report.buildings.flatMap((building) => building.units.filter((unit) => unit.expectedAmount > 0).map((unit) => ({ ...unit, building: building.name }))).sort((left, right) => right.expectedAmount - left.expectedAmount).slice(0, 10);
    const chartHeight = 76;
    const x = margin;
    const y = cursor;
    const width = pageWidth - margin * 2;
    setFill(colors.surface); setStroke(colors.line); doc.roundedRect(x, y, width, chartHeight, 3, 3, "FD");
    setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Aluguéis individuais", x + 8, y + 10);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text("Previsto x recebido por unidade · maiores cobranças da competência", x + 8, y + 16);
    setStroke(colors.blue); doc.setLineWidth(1); doc.line(x + width - 68, y + 9, x + width - 58, y + 9); setText(colors.muted); doc.setFontSize(6.5); doc.text("Previsto", x + width - 55, y + 10.5);
    setStroke(colors.green); doc.line(x + width - 33, y + 9, x + width - 23, y + 9); doc.text("Recebido", x + width - 20, y + 10.5);
    if (!units.length) { setText(colors.muted); doc.setFontSize(8); doc.text("Nenhuma cobrança de aluguel encontrada nesta competência.", x + 8, y + 42); cursor += chartHeight + 10; return; }
    const plotLeft = x + 12; const plotRight = x + width - 10; const plotTop = y + 24; const plotBottom = y + chartHeight - 16; const maxValue = Math.max(1, ...units.flatMap((unit) => [unit.expectedAmount, unit.receivedAmount]));
    setStroke(colors.line); doc.setLineWidth(.2); for (const ratio of [0, .5, 1]) { const gridY = plotBottom - (plotBottom - plotTop) * ratio; doc.line(plotLeft, gridY, plotRight, gridY); }
    const point = (index: number, value: number) => ({ x: units.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + (plotRight - plotLeft) * index / (units.length - 1), y: plotBottom - (plotBottom - plotTop) * value / maxValue });
    const drawSeries = (key: "expectedAmount" | "receivedAmount", color: [number, number, number]) => {
      const points = units.map((unit, index) => point(index, unit[key])); setStroke(color); doc.setLineWidth(.8); for (let index = 1; index < points.length; index++) doc.line(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y); setFill(color); for (const item of points) doc.circle(item.x, item.y, 1.3, "F");
    };
    drawSeries("expectedAmount", colors.blue); drawSeries("receivedAmount", colors.green);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); units.forEach((unit, index) => doc.text(pdfText(shortText(unit.code, 9)), point(index, 0).x, plotBottom + 8, { align: "center" }));
    cursor += chartHeight + 10;
  };
  const propertyBars = () => {
    const buildings = report.buildings.filter((building) => building.expectedAmount > 0).sort((left, right) => right.expectedAmount - left.expectedAmount).slice(0, 7);
    const cardHeight = Math.max(36, buildings.length * 11 + 22);
    ensureSpace(cardHeight);
    const x = margin; const y = cursor; const width = pageWidth - margin * 2;
    setFill(colors.surface); setStroke(colors.line); doc.roundedRect(x, y, width, cardHeight, 3, 3, "FD");
    setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Recebimentos por imóvel", x + 8, y + 10);
    setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text("Comparativo do previsto e do recebido", x + 8, y + 16);
    if (!buildings.length) { doc.text("Nenhum imóvel com cobrança no mês.", x + 8, y + 31); cursor += cardHeight + 10; return; }
    const barX = x + 8; const barWidth = width - 16; buildings.forEach((building, index) => { const rowY = y + 24 + index * 11; const ratio = building.expectedAmount > 0 ? Math.min(1, building.receivedAmount / building.expectedAmount) : 0; setText(colors.text); doc.setFontSize(6.8); doc.text(pdfText(shortText(building.name, 35)), barX, rowY); setText(colors.muted); doc.text(`${building.paymentRate}%`, x + width - 8, rowY, { align: "right" }); setFill(colors.surfaceAlt); doc.roundedRect(barX, rowY + 2, barWidth, 3, 1.5, 1.5, "F"); setFill(colors.green); doc.roundedRect(barX, rowY + 2, Math.max(1, barWidth * ratio), 3, 1.5, 1.5, "F"); });
    cursor += cardHeight + 10;
  };
  const table = (head: string[], body: string[][]) => {
    autoTable(doc, { startY: cursor, margin: { left: margin, right: margin, top: 24, bottom: 19 }, head: [head.map(pdfText)], body: body.map((row) => row.map(pdfText)), theme: "grid", styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.5, textColor: colors.text, fillColor: colors.surface, lineColor: colors.line, lineWidth: .2, overflow: "linebreak" }, headStyles: { fillColor: colors.surfaceAlt, textColor: colors.green, fontStyle: "bold" }, alternateRowStyles: { fillColor: [20, 32, 48] }, didDrawPage: (data) => { if (data.pageNumber > 1) { drawBackground(); drawSmallHeader(); } } });
    cursor = (doc.lastAutoTable?.finalY ?? cursor) + 9;
  };
  drawBackground();
  setFill(colors.green); doc.roundedRect(margin, 14, 14, 14, 3, 3, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(colors.bg); doc.text("CF", margin + 7, 22.8, { align: "center" });
  setText(colors.text); doc.setFontSize(20); doc.text("REPORT GERAL", margin + 21, 20.5); doc.setFontSize(12); setText(colors.green); doc.text(pdfText(report.monthLabel), margin + 21, 27.5);
  setText(colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Cardoso Finance · visão gerencial da competência selecionada", margin + 21, 35);
  setStroke(colors.line); doc.setLineWidth(.35); doc.line(margin, 43, pageWidth - margin, 43);
  if (hasCategory(categories, "summary")) {
    sectionTitle("Resumo executivo", "Indicadores financeiros e operacionais");
    const cardGap = 4; const cardWidth = (pageWidth - margin * 2 - cardGap * 3) / 4;
    metricCard(margin, cursor, cardWidth, "RECEBIDO NO MÊS", brl(report.receivedRevenue), `de ${brl(report.expectedRevenue)} previsto`, colors.green);
    metricCard(margin + cardWidth + cardGap, cursor, cardWidth, "RESULTADO LÍQUIDO", brl(report.netResult), "Recebido menos despesas", report.netResult >= 0 ? colors.green : colors.red);
    metricCard(margin + (cardWidth + cardGap) * 2, cursor, cardWidth, "DESPESAS", brl(report.expenses), "Na competência", colors.amber);
    metricCard(margin + (cardWidth + cardGap) * 3, cursor, cardWidth, "PENDÊNCIAS", String(report.unpaidTenants.length), `${report.unpaidUnits} unidade${report.unpaidUnits === 1 ? "" : "s"} em aberto`, report.unpaidTenants.length ? colors.red : colors.green);
    cursor += 38;
    const healthGap = 4; const healthWidth = (pageWidth - margin * 2 - healthGap) / 2;
    progressCard(margin, cursor, healthWidth, "OCUPAÇÃO DA CARTEIRA", report.occupancyRate, `${report.occupiedUnits} de ${report.totalUnits} unidades`, colors.green);
    progressCard(margin + healthWidth + healthGap, cursor, healthWidth, "PAGAMENTOS RECEBIDOS", report.paymentRate, `${report.paidUnits} de ${report.chargedUnits} cobranças`, colors.blue);
    cursor += 43;
    lineChart();
    propertyBars();
  }
  if (hasCategory(categories, "properties")) {
    sectionTitle("Detalhamento por imóvel", "Unidades, inquilinos e status de pagamento");
    for (const building of report.buildings) {
      if (!building.units.length) continue;
      const highlights = propertyHighlightLabels(building);
      ensureSpace(highlights.length ? 30 : 22);
      setText(colors.text); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(pdfText(shortText(`${building.name}${building.city ? ` - ${building.city}${building.state ? `/${building.state}` : ""}` : ""}`, 70)), margin, cursor);
      setText(colors.green); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`${building.paymentRate}% pago · ${brl(building.receivedAmount)} / ${brl(building.expectedAmount)}`, pageWidth - margin, cursor, { align: "right" });
      if (highlights.length) {
        let highlightX = margin;
        for (const highlight of highlights) {
          const highlightWidth = doc.getTextWidth(pdfText(highlight)) + 8;
          const highlightColor = highlight === "À venda" ? colors.red : colors.amber;
          setFill(highlightColor); doc.roundedRect(highlightX, cursor + 3, highlightWidth, 4.5, 1.5, 1.5, "F");
          setText(colors.bg); doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.text(pdfText(highlight), highlightX + 4, cursor + 6.1);
          highlightX += highlightWidth + 3;
        }
        cursor += 11;
      } else cursor += 5;
      table(["Unidade", "Inquilino", "Previsto", "Recebido", "Status"], building.units.map((unit) => [unit.code, unit.status === "no_lease" ? "-" : unit.tenant, unit.status === "no_lease" ? "-" : brl(unit.expectedAmount), unit.status === "no_lease" ? "-" : brl(unit.receivedAmount), statusLabels[unit.status]]));
    }
  }
  if (hasCategory(categories, "unpaid")) {
    sectionTitle("Inquilinos que não pagaram", "Pendências agrupadas por inquilino");
    table(["Inquilino", "Imóvel / unidade", "Vencimento", "Em aberto", "Status"], report.unpaidTenants.length ? report.unpaidTenants.map((tenant) => [tenant.tenant, tenant.units.join("; "), tenant.dueDates.length ? tenant.dueDates.map(dateLabel).join(", ") : "Sem vencimento", brl(Math.max(0, tenant.expectedAmount - tenant.receivedAmount)), statusLabels[tenant.status]]) : [["Nenhuma pendência", "-", "-", brl(0), "Pago ou isento"]]);
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); drawFooter(page); }
  doc.save(reportFileName(report.month));
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
      {hasCategory(categories, "summary") && <ReportVisuals report={report} />}
      {hasCategory(categories, "properties") && <section className="report-section">
        <div className="report-section-heading"><div><h3>Prédios, imóveis e unidades</h3><p>{report.buildings.length} imóveis · {report.totalUnits} unidades cadastradas · {report.chargedUnits} com cobrança no mês</p></div></div>
        {report.buildings.length ? <div className="report-building-list">{report.buildings.map((building) => {
          const highlights = propertyHighlightLabels(building);
          return <div className="report-building" key={building.id}><div className="report-building-heading"><div><strong>{building.name}</strong><small>{[building.city, building.state].filter(Boolean).join(" · ") || "Localização não informada"}</small>{highlights.length > 0 && <div className="report-building-flags">{highlights.map((highlight) => <span className={`report-building-flag ${highlight === "À venda" ? "sale" : "near-sale"}`} key={highlight}>{highlight}</span>)}</div>}</div><span>{building.units.length} unidade{building.units.length === 1 ? "" : "s"} · {building.paymentRate}% pago</span></div>{building.units.length ? <div className="table-wrap"><table className="report-table"><thead><tr><th>Unidade</th><th>Inquilino</th><th>Previsto</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{building.units.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.type}{unit.quantity > 1 ? ` · ${unit.quantity} unidades` : ""}</small></td><td>{unit.status === "no_lease" ? "-" : unit.tenant}</td><td>{unit.status === "no_lease" ? "-" : brl(unit.expectedAmount)}</td><td>{unit.status === "no_lease" ? "-" : brl(unit.receivedAmount)}</td><td><span className={`report-status report-status-${unit.status}`}>{statusLabels[unit.status]}</span>{unit.status !== "no_lease" && <small>{unit.status === "paid" || unit.status === "waived" ? "Competência quitada" : dateLabel(unit.dueDate)}</small>}</td></tr>)}</tbody></table></div> : <p className="report-empty-line">Nenhuma unidade cadastrada neste imóvel.</p>}</div>;
        })}</div> : <div className="empty-state report-empty"><FileText size={28} /><h3>Nenhum imóvel encontrado</h3><p>Não há imóveis disponíveis para esta organização.</p></div>}
      </section>}
      {hasCategory(categories, "unpaid") && <section className="report-section"><div className="report-section-heading"><div><h3>Inquilinos que não pagaram</h3><p>Pendências agrupadas por inquilino, sem duplicar quem ocupa mais de uma unidade.</p></div><span className={report.unpaidTenants.length ? "negative" : "positive"}>{report.unpaidTenants.length} pendência{report.unpaidTenants.length === 1 ? "" : "s"}</span></div>{report.unpaidTenants.length ? <div className="table-wrap"><table className="report-table report-unpaid-table"><thead><tr><th>Inquilino</th><th>Imóvel / unidade</th><th>Vencimento</th><th>Em aberto</th><th>Status</th></tr></thead><tbody>{report.unpaidTenants.map((tenant) => <tr key={tenant.id}><td><strong>{tenant.tenant}</strong></td><td>{tenant.units.join("; ")}</td><td>{tenant.dueDates.length ? tenant.dueDates.map(dateLabel).join(", ") : "Sem vencimento"}</td><td className="negative"><strong>{brl(Math.max(0, tenant.expectedAmount - tenant.receivedAmount))}</strong><small>de {brl(tenant.expectedAmount)}</small></td><td><span className={`report-status report-status-${tenant.status}`}>{statusLabels[tenant.status]}</span></td></tr>)}</tbody></table></div> : <div className="report-success"><Users size={19} /><div><strong>Nenhuma pendência identificada</strong><p>Todos os inquilinos com cobrança no mês estão pagos ou isentos.</p></div></div>}</section>}
      <div className="report-modal-footer">{hasCategory(categories, "summary") && <span>Resultado líquido recebido - despesas: <strong className={report.netResult < 0 ? "negative" : "positive"}>{brl(report.netResult)}</strong></span>}<div className="report-request-actions"><button type="button" className="button button-ghost" onClick={() => downloadMonthlyReportPdf(report, categories)}><Download size={14} /> Baixar PDF</button><button type="button" className="button button-ghost" onClick={onClose}>Fechar report</button></div></div>
    </section>
  </div>;
}

function ReportVisuals({ report }: { report: MonthlyReportData }) {
  const rentalUnits = report.buildings.flatMap((building) => building.units.filter((unit) => unit.expectedAmount > 0).map((unit) => ({ ...unit, building: building.name })));
  const lineUnits = [...rentalUnits].sort((left, right) => right.expectedAmount - left.expectedAmount).slice(0, 10);
  const propertyBars = [...report.buildings].filter((building) => building.expectedAmount > 0).sort((left, right) => right.expectedAmount - left.expectedAmount).slice(0, 7);
  const maxRent = Math.max(1, ...lineUnits.map((unit) => unit.expectedAmount));
  const chartWidth = 640;
  const chartHeight = 156;
  const chartLeft = 28;
  const chartRight = 12;
  const chartTop = 14;
  const chartBottom = 30;
  const chartX = (index: number) => lineUnits.length > 1 ? chartLeft + (index * (chartWidth - chartLeft - chartRight)) / (lineUnits.length - 1) : chartWidth / 2;
  const chartY = (value: number) => chartTop + (1 - value / maxRent) * (chartHeight - chartTop - chartBottom);
  const expectedPoints = lineUnits.map((unit, index) => `${chartX(index)},${chartY(unit.expectedAmount)}`).join(" ");
  const receivedPoints = lineUnits.map((unit, index) => `${chartX(index)},${chartY(unit.receivedAmount)}`).join(" ");
  return <div className="report-visuals">
    <div className="report-visual-card report-health-card"><div className="report-visual-heading"><div><strong>Saúde da carteira</strong><small>Indicadores da competência selecionada</small></div><span className="report-visual-badge">{report.monthLabel}</span></div><div className="report-health-grid"><div className="report-ring-wrap"><div className="report-ring" style={{ background: `conic-gradient(#80e2b0 ${report.occupancyRate}%, rgba(255,255,255,.08) 0)` }}><div><strong>{report.occupancyRate}%</strong><small>ocupação</small></div></div><span>{report.occupiedUnits} de {report.totalUnits} unidades ocupadas</span></div><div className="report-ring-wrap"><div className="report-ring" style={{ background: `conic-gradient(#62b6ff ${report.paymentRate}%, rgba(255,255,255,.08) 0)` }}><div><strong>{report.paymentRate}%</strong><small>pagamentos</small></div></div><span>{report.paidUnits} de {report.chargedUnits} cobranças pagas</span></div></div></div>
    <div className="report-visual-card report-chart-card"><div className="report-visual-heading"><div><strong>Aluguéis individuais</strong><small>Previsto x recebido por unidade</small></div><div className="report-chart-legend"><span><i className="expected" /> Previsto</span><span><i className="received" /> Recebido</span></div></div>{lineUnits.length ? <><svg className="report-line-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Gráfico de aluguéis individuais previstos e recebidos"><line x1={chartLeft} x2={chartWidth - chartRight} y1={chartTop} y2={chartTop} /><line x1={chartLeft} x2={chartWidth - chartRight} y1={(chartHeight - chartBottom + chartTop) / 2} y2={(chartHeight - chartBottom + chartTop) / 2} /><line x1={chartLeft} x2={chartWidth - chartRight} y1={chartHeight - chartBottom} y2={chartHeight - chartBottom} /><polyline className="report-chart-line expected" points={expectedPoints} /><polyline className="report-chart-line received" points={receivedPoints} />{lineUnits.map((unit, index) => <g key={unit.id}><circle className="report-chart-point expected" cx={chartX(index)} cy={chartY(unit.expectedAmount)} r="3" /><circle className="report-chart-point received" cx={chartX(index)} cy={chartY(unit.receivedAmount)} r="3" /><text x={chartX(index)} y={chartHeight - 11} textAnchor="middle">{unit.code.length > 8 ? `${unit.code.slice(0, 7)}…` : unit.code}</text></g>)}</svg><p className="report-chart-note">Exibindo as {lineUnits.length} maiores cobranças do mês.</p></> : <div className="report-chart-empty">Nenhuma cobrança de aluguel encontrada nesta competência.</div>}</div>
    <div className="report-visual-card report-property-chart"><div className="report-visual-heading"><div><strong>Recebimentos por imóvel</strong><small>Comparativo do previsto e do recebido</small></div></div>{propertyBars.length ? <div className="report-property-bars">{propertyBars.map((building) => <div className="report-property-bar" key={building.id}><div><strong>{building.name}</strong><span>{brl(building.receivedAmount)} / {brl(building.expectedAmount)}</span></div><div className="report-bar-track"><i style={{ width: `${Math.min(100, building.expectedAmount ? building.receivedAmount / building.expectedAmount * 100 : 0)}%` }} /><b style={{ width: `${Math.min(100, building.expectedAmount ? building.receivedAmount / building.expectedAmount * 100 : 0)}%` }} /></div></div>)}</div> : <div className="report-chart-empty">Nenhum imóvel com cobrança no mês.</div>}</div>
  </div>;
}

function ReportMetric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "positive" | "negative" }) {
  return <div className="report-metric"><div className="report-metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className={tone ?? ""}>{value}</strong><small>{detail}</small></div>;
}
