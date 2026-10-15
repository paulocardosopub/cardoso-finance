import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { brl } from "@/lib/format";
import { divisionMembers, type DivisionAssignment, type DivisionMember, type DivisionMetrics, type DivisionUnit, type EqualizationTransfer } from "@/lib/division";

type PdfDocument = jsPDF & { lastAutoTable?: { finalY: number } };

function pdfText(value: string) {
  return value.replace(/[·−—]/g, "-");
}

function fileName(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return normalized || "divisao-patrimonial";
}

export function downloadDivisionPdf({ simulationName, metrics, members = divisionMembers, transfers, units, assignments, divisionMode }: { simulationName: string; metrics: DivisionMetrics; members?: DivisionMember[]; transfers: EqualizationTransfer[]; units: DivisionUnit[]; assignments: Record<string, DivisionAssignment>; divisionMode: "unit" | "building" }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as PdfDocument;
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursor = 17;

  doc.setFillColor(23, 30, 43);
  doc.rect(0, 0, pageWidth, 31, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfText("Divisão patrimonial"), margin, cursor);
  cursor += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(183, 198, 216);
  doc.text(pdfText(simulationName || "Nova divisão"), margin, cursor);
  cursor = 42;

  const pageFooter = () => {
    const height = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
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
    autoTable(doc, {
      startY: cursor,
      margin: { left: margin, right: margin },
      head: [head.map(pdfText)],
      body: body.map((row) => row.map(pdfText)),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.4, textColor: [55, 64, 78], overflow: "linebreak" },
      headStyles: { fillColor: [23, 30, 43], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 251] },
      didDrawPage: pageFooter,
    });
    cursor = (doc.lastAutoTable?.finalY ?? cursor) + 9;
  };

  sectionTitle("Resumo da carteira");
  table(["Indicador", "Resultado"], [
    ["Patrimônio total", brl(metrics.totalValue)],
    ["Patrimônio distribuído", brl(metrics.distributedValue)],
    ["Patrimônio pendente", brl(metrics.pendingValue)],
    ["Renda mensal prevista", brl(metrics.totalRent)],
    ["Equilíbrio patrimonial", metrics.propertyBalance == null ? "-" : `${metrics.propertyBalance.toFixed(0)}%`],
  ]);

  sectionTitle("Resumo para igualar");
  table(["Membro que paga", "Membro que recebe", "Valor"], transfers.length
    ? transfers.map((transfer) => [transfer.fromName, transfer.toName, brl(transfer.amount)])
    : [["Divisão já igualitária", "-", brl(0)]]);

  const assignmentName = (assignment: DivisionAssignment) => assignment === "shared" ? "Compartilhado" : members.find((member) => member.id === assignment)?.name ?? "Pendente";
  const allocationRows = divisionMode === "building"
    ? [...new Map(units.map((unit) => [unit.buildingId, units.filter((item) => item.buildingId === unit.buildingId)])).values()].map((buildingUnits) => {
      const firstAssignment = assignments[buildingUnits[0]?.id] ?? null;
      const sameAssignment = buildingUnits.every((unit) => (assignments[unit.id] ?? null) === firstAssignment);
      const buildingValue = buildingUnits.find((unit) => unit.buildingValue != null)?.buildingValue ?? buildingUnits.reduce((sum, unit) => sum + (unit.value ?? 0), 0);
      return [assignmentName(sameAssignment ? firstAssignment : null), buildingUnits[0]?.buildingName ?? "Imóvel", brl(buildingValue), brl(buildingUnits.reduce((sum, unit) => sum + unit.rent, 0))];
    })
    : units.map((unit) => [assignmentName(assignments[unit.id] ?? null), `${unit.buildingName} · ${unit.code}`, brl(unit.value ?? 0), brl(unit.rent)]);
  sectionTitle("Distribuição atual");
  table(["Destino", "Imóvel / unidade", "Patrimônio", "Renda mensal"], allocationRows.length ? allocationRows : [["Pendente", "Nenhum item cadastrado", brl(0), brl(0)]]);

  sectionTitle("Patrimônio por membro");
  table(["Membro", "Patrimônio", "% do total", "Diferença da meta"], metrics.members.map((member) => [
    member.name,
    brl(member.value),
    `${member.share.toFixed(1)}%`,
    `${member.valueDifference >= 0 ? "+" : "-"}${brl(Math.abs(member.valueDifference))}`,
  ]));

  if (doc.getNumberOfPages() === 1) pageFooter();
  doc.save(`${fileName(simulationName)}-resumo.pdf`);
}
