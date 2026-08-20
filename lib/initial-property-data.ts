import type { Building, PropertyUnit } from "@/types/domain";

export type InitialProperty = {
  id: string;
  buildingId: string;
  buildingName: string;
  uf: string;
  city: string;
  label: string;
  unitCode: string;
  unitType: string;
  value: number;
  appraisal: number;
  status: string;
  rent?: number;
  registration?: string;
  notes?: string;
  unitCount?: number;
};

/**
 * Dados iniciais importados de "dados imoveis.xlsx".
 * Os registros repetidos foram agrupados por endereço/conjunto em prédios;
 * os códigos KIT/LOJA/APT continuam preservados como unidades.
 */
export const initialProperties: InitialProperty[] = [
  { id: "p-00", buildingId: "casa-lago-sul", buildingName: "Casa Lago Sul", uf: "DF", city: "Lago Sul", label: "SHIS QI 05 CONJUNTO 16 CASA 06 - LAGO SUL", unitCode: "Casa 06", unitType: "Casa", value: 2000000, appraisal: 2000000, status: "Não alugado", notes: "Mãe vai transferir" },
  { id: "p-01", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 01", unitCode: "KIT 01", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 860, notes: "IMOVEL JA É NOSSO" },
  { id: "p-02", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 02", unitCode: "KIT 02", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 830, notes: "IMOVEL JA É NOSSO" },
  { id: "p-03", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 03", unitCode: "KIT 03", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 850, notes: "IMOVEL JA É NOSSO" },
  { id: "p-04", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 04", unitCode: "KIT 04", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 900, notes: "IMOVEL JA É NOSSO" },
  { id: "p-05", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 05", unitCode: "KIT 05", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 850, notes: "IMOVEL JA É NOSSO" },
  { id: "p-06", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 06", unitCode: "KIT 06", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 950, notes: "IMOVEL JA É NOSSO" },
  { id: "p-07", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 07", unitCode: "KIT 07", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 730, notes: "IMOVEL JA É NOSSO" },
  { id: "p-08", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 08", unitCode: "KIT 08", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Não alugado", notes: "IMOVEL JA É NOSSO" },
  { id: "p-09", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 KIT 09", unitCode: "KIT 09", unitType: "Kitnet", value: 95500, appraisal: 95500, status: "Alugado", rent: 650, notes: "IMOVEL JA É NOSSO" },
  { id: "p-10", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 01", unitCode: "LOJA 01", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1500, notes: "IMOVEL JA É NOSSO" },
  { id: "p-11", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 02", unitCode: "LOJA 02", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1400, notes: "IMOVEL JA É NOSSO" },
  { id: "p-12", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 03", unitCode: "LOJA 03", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1600, notes: "IMOVEL JA É NOSSO" },
  { id: "p-13", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 04", unitCode: "LOJA 04", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1656, notes: "IMOVEL JA É NOSSO" },
  { id: "p-15", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 05", unitCode: "LOJA 05", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1350, notes: "IMOVEL JA É NOSSO" },
  { id: "p-16", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 06", unitCode: "LOJA 06", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1400, notes: "IMOVEL JA É NOSSO" },
  { id: "p-17", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 07", unitCode: "LOJA 07", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1200, notes: "IMOVEL JA É NOSSO" },
  { id: "p-18", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 08", unitCode: "LOJA 08", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1340, notes: "IMOVEL JA É NOSSO" },
  { id: "p-19", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 09", unitCode: "LOJA 09", unitType: "Loja", value: 95500, appraisal: 95500, status: "Imobiliária?", notes: "IMOVEL JA É NOSSO" },
  { id: "p-20", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 10", unitCode: "LOJA 10", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1400, notes: "IMOVEL JA É NOSSO" },
  { id: "p-21", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 11", unitCode: "LOJA 11", unitType: "Loja", value: 95500, appraisal: 95500, status: "Não alugado", notes: "IMOVEL JA É NOSSO" },
  { id: "p-22", buildingId: "405-cruzeiro", buildingName: "405 · Kitnets e lojas", uf: "DF", city: "Cruzeiro", label: "405 LOJA 12", unitCode: "LOJA 12", unitType: "Loja", value: 95500, appraisal: 95500, status: "Alugado", rent: 1300, notes: "IMOVEL JA É NOSSO" },
  { id: "p-23", buildingId: "cruzeiro-center", buildingName: "Cruzeiro Center", uf: "DF", city: "Cruzeiro", label: "Cruzeiro Center (Subsolos 101, 102, 103, 104)", unitCode: "Subsolos 101–104", unitType: "Subsolo", value: 1200000, appraisal: 1200000, status: "Alugado", rent: 2800, unitCount: 4, notes: "IMOVEL JA É NOSSO" },
  { id: "p-24", buildingId: "cruzeiro-center", buildingName: "Cruzeiro Center", uf: "DF", city: "Cruzeiro", label: "Cruzeiro Center loja 43", unitCode: "Loja 43", unitType: "Loja", value: 300000, appraisal: 300000, status: "Alugado", rent: 1300, notes: "IMOVEL JA É NOSSO" },
  { id: "p-25", buildingId: "cruzeiro-center", buildingName: "Cruzeiro Center", uf: "DF", city: "Cruzeiro", label: "Cruzeiro Center lojas 51 e 53", unitCode: "Lojas 51 e 53", unitType: "Loja", value: 600000, appraisal: 600000, status: "Alugado", rent: 3600, unitCount: 2, notes: "IMOVEL JA É NOSSO" },
  { id: "p-26", buildingId: "sqs-314", buildingName: "SQS 314", uf: "DF", city: "Asa Sul", label: "SQS 314 Loja, sobreloja e subsolo", unitCode: "Loja + sobreloja + subsolo", unitType: "Conjunto comercial", value: 1300000, appraisal: 1300000, status: "Alugado", rent: 3200, unitCount: 3, notes: "IMOVEL JA É NOSSO" },
  { id: "p-27", buildingId: "sgas-915", buildingName: "SGAS 915 · Consultórios", uf: "DF", city: "Asa Sul", label: "Consultório 211, SGAS 915, Bloco A, Conjunto B", unitCode: "Consultório 211", unitType: "Consultório", value: 173354.66, appraisal: 210000, status: "Não alugado", registration: "96563" },
  { id: "p-28", buildingId: "sgas-915", buildingName: "SGAS 915 · Consultórios", uf: "DF", city: "Asa Sul", label: "Consultório 310, SGAS 915, Bloco D, Conjunto B", unitCode: "Consultório 310", unitType: "Consultório", value: 184409.44, appraisal: 190000, status: "Não alugado", registration: "96646" },
  { id: "p-29", buildingId: "qi-33-guara", buildingName: "QI-33 · Bloco A", uf: "DF", city: "Guará", label: "Loja 05, Bloco A, QI-33", unitCode: "Loja 05", unitType: "Loja", value: 160805.88, appraisal: 220000, status: "Alugado", rent: 1568.94, registration: "10580" },
  { id: "p-30", buildingId: "qi-33-guara", buildingName: "QI-33 · Bloco A", uf: "DF", city: "Guará", label: "Loja 20, Bloco A, QI-33", unitCode: "Loja 20", unitType: "Loja", value: 160805.88, appraisal: 180000, status: "Alugado", rent: 1700, registration: "10586" },
  { id: "p-31", buildingId: "qi-33-guara", buildingName: "QI-33 · Bloco A", uf: "DF", city: "Guará", label: "Loja 21, Bloco A, QI-33", unitCode: "Loja 21", unitType: "Loja", value: 160805.88, appraisal: 180000, status: "Alugado", rent: 2000, registration: "10587" },
  { id: "p-32", buildingId: "lucio-costa", buildingName: "Lúcio Costa", uf: "DF", city: "Guará", label: "LUCIO COSTA LOJA 05", unitCode: "Loja 05", unitType: "Loja", value: 96483, appraisal: 206000, status: "Não alugado", registration: "26910" },
  { id: "p-33", buildingId: "lucio-costa", buildingName: "Lúcio Costa", uf: "DF", city: "Guará", label: "LUCIO COSTA LOJA 06", unitCode: "Loja 06", unitType: "Loja", value: 96483, appraisal: 206000, status: "Alugado", rent: 900, registration: "26910" },
  { id: "p-34", buildingId: "lucio-costa", buildingName: "Lúcio Costa", uf: "DF", city: "Guará", label: "LUCIO COSTA LOJA 07", unitCode: "Loja 07", unitType: "Loja", value: 96483, appraisal: 206000, status: "Alugado", rent: 900, registration: "26910" },
  { id: "p-35", buildingId: "lucio-costa", buildingName: "Lúcio Costa", uf: "DF", city: "Guará", label: "LUCIO COSTA APT 105", unitCode: "Apt 105", unitType: "Apartamento", value: 96483, appraisal: 206000, status: "Alugado", rent: 1200, registration: "26910" },
  { id: "p-36", buildingId: "lucio-costa", buildingName: "Lúcio Costa", uf: "DF", city: "Guará", label: "LUCIO COSTA APT 106", unitCode: "Apt 106", unitType: "Apartamento", value: 96483, appraisal: 206000, status: "Alugado", rent: 1000, registration: "26910" },
  { id: "p-37", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8, Conjunto D, Lote 28-A KIT 100", unitCode: "KIT 100", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 700, registration: "41243" },
  { id: "p-38", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 101", unitCode: "KIT 101", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 600, registration: "41243" },
  { id: "p-39", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 102", unitCode: "KIT 102", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 650, registration: "41243" },
  { id: "p-40", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 201", unitCode: "KIT 201", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Não alugado", registration: "41243" },
  { id: "p-41", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 202", unitCode: "KIT 202", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Não alugado", registration: "41243" },
  { id: "p-42", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 203", unitCode: "KIT 203", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 650, registration: "41243" },
  { id: "p-43", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 204", unitCode: "KIT 204", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 650, registration: "41243" },
  { id: "p-44", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 301", unitCode: "KIT 301", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Não alugado", registration: "41243" },
  { id: "p-45", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 302", unitCode: "KIT 302", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 750, registration: "41243" },
  { id: "p-46", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 303", unitCode: "KIT 303", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 650, registration: "41243" },
  { id: "p-47", buildingId: "qnn-8-ceilandia", buildingName: "QNN 8 · Kitnets", uf: "DF", city: "Ceilândia", label: "QNN 8 KIT 304", unitCode: "KIT 304", unitType: "Kitnet", value: 38822, appraisal: 31820, status: "Alugado", rent: 650, registration: "41243" },
  { id: "p-48", buildingId: "jockey-club", buildingName: "Edifício Jockey Club", uf: "DF", city: "Setor Comercial Sul", label: "Sala 303, Ed. Jockey Club, Setor Comercial Sul", unitCode: "Sala 303", unitType: "Sala comercial", value: 98107.86, appraisal: 800000, status: "Não alugado", registration: "92704" },
  { id: "p-49", buildingId: "qnn-12a", buildingName: "QNN 12-A", uf: "DF", city: "Ceilândia", label: "Apartamento 606, QNN 12-A, Lote 4", unitCode: "Apartamento 606", unitType: "Apartamento", value: 110463.24, appraisal: 170000, status: "Alugado", rent: 1500, registration: "34842" },
  { id: "p-50", buildingId: "praca-4-gama", buildingName: "Entrequadra Praça 4", uf: "DF", city: "Gama", label: "Entrequadra Praça 4, Bloco C, Setor Sul", unitCode: "Bloco C", unitType: "Terreno/edificação", value: 324870.28, appraisal: 860000, status: "À venda", registration: "13989", notes: "VISITADO, 1200M² GIGANTE" },
  { id: "p-51", buildingId: "qs-404-samambaia", buildingName: "QS-404 · Lote 01", uf: "DF", city: "Samambaia", label: "Lote 01, Conjunto D, Quadra QS-404", unitCode: "Lote 01", unitType: "Terreno", value: 171558.95, appraisal: 800000, status: "À venda", registration: "193683", notes: "VISITADO, AO LADO DE UMA ESCOLA" },
  { id: "p-52", buildingId: "qnn-37-ceilandia", buildingName: "QNN-37 · Bloco 2", uf: "DF", city: "Ceilândia", label: "QNN-37, Bloco 2", unitCode: "Bloco 2", unitType: "Terreno", value: 557510.7, appraisal: 2000000, status: "À venda", registration: "21071", notes: "TERRENO AO LADO DA FEIRA" },
  { id: "p-53", buildingId: "chacara-218", buildingName: "Chácara 218", uf: "DF", city: "Vicente Pires", label: "Chácara 218, Lote 20", unitCode: "Lote 20", unitType: "Terreno", value: 232790.81, appraisal: 600000, status: "À venda", notes: "DENTRO DE CONDOMINIO, TERRENO" },
  { id: "p-54", buildingId: "scia-cidade-automovel", buildingName: "SCIA · Cidade do Automóvel", uf: "DF", city: "SCIA", label: "Lote 13, Conjunto 5, Quadra 15, SCIA – Cidade do Automóvel", unitCode: "Lote 13", unitType: "Terreno", value: 420015.09, appraisal: 1050000, status: "À venda", registration: "26366" },
  { id: "p-55", buildingId: "casa-buzios", buildingName: "Casa Búzios", uf: "", city: "Búzios", label: "CASA BUZIOS RUA JERIVÁ J-9", unitCode: "Casa J-9", unitType: "Casa", value: 1500000, appraisal: 1500000, status: "Não alugado", notes: "IMOVEL JA É NOSSO" },
  { id: "p-56", buildingId: "ipanema-rua-barao", buildingName: "Apartamento Ipanema", uf: "RJ", city: "Rio de Janeiro · Ipanema", label: "Apartamento 303, Rua Barão da Torre, 209", unitCode: "Apartamento 303", unitType: "Apartamento", value: 799388.36, appraisal: 799388.36, status: "Alugado", rent: 2000, registration: "102561" },
  { id: "p-57", buildingId: "sala-republica-chile", buildingName: "Sala República do Chile", uf: "RJ", city: "Rio de Janeiro · Centro", label: "Sala 1.107, Ed. Avenida República do Chile, Rua da Relação, 49", unitCode: "Sala 1.107", unitType: "Sala comercial", value: 100000, appraisal: 100000, status: "Não alugado" },
  { id: "p-58", buildingId: "casa-engenho-dentro", buildingName: "Casa Engenho de Dentro", uf: "RJ", city: "Rio de Janeiro · Engenho de Dentro", label: "Casa 165, Rua Jaime Benévolo", unitCode: "Casa 165", unitType: "Casa", value: 446751, appraisal: 446751, status: "Não alugado", registration: "16531" },
  { id: "p-59", buildingId: "granja-arcozelo", buildingName: "Granja Monte Cristo", uf: "RJ", city: "Arcozelo", label: "Granja 174, Monte Cristo", unitCode: "Granja 174", unitType: "Granja", value: 22620, appraisal: 22620, status: "Não alugado", registration: "3666" },
  { id: "p-60", buildingId: "vila-rosa-paty", buildingName: "Vila Rosa · Paty do Alferes", uf: "RJ", city: "Paty do Alferes", label: "Lote 40, Vila Rosa", unitCode: "Lote 40", unitType: "Terreno", value: 41448.38, appraisal: 41448.38, status: "Não alugado", registration: "5076" },
  { id: "p-61", buildingId: "vila-rosa-paty", buildingName: "Vila Rosa · Paty do Alferes", uf: "RJ", city: "Paty do Alferes", label: "Lote 36, Vila Rosa", unitCode: "Lote 36", unitType: "Terreno", value: 143505.96, appraisal: 143505.96, status: "Não alugado", registration: "6803" },
  { id: "p-62", buildingId: "vila-rosa-paty", buildingName: "Vila Rosa · Paty do Alferes", uf: "RJ", city: "Paty do Alferes", label: "Lote 42, Vila Rosa", unitCode: "Lote 42", unitType: "Terreno", value: 40449.62, appraisal: 40449.62, status: "Não alugado", registration: "6711" },
];

function unitStatus(status: string): PropertyUnit["status"] {
  if (status === "Alugado") return "alugado";
  if (status === "À venda") return "venda";
  return "vago";
}

function buildingStatus(properties: InitialProperty[]): Building["status"] {
  if (properties.every((property) => property.status === "À venda")) return "venda";
  return "ativo";
}

const grouped = new Map<string, InitialProperty[]>();
for (const property of initialProperties) {
  const group = grouped.get(property.buildingId) ?? [];
  group.push(property);
  grouped.set(property.buildingId, group);
}

export const initialUnitsByBuilding = new Map<string, PropertyUnit[]>();

export const initialBuildings: Building[] = Array.from(grouped.entries()).map(([buildingId, properties]) => {
  const first = properties[0];
  const unitsData = properties.map((property) => ({
    id: property.id,
    code: property.unitCode,
    type: property.unitType,
    area: 0,
    status: unitStatus(property.status),
    rent: property.rent ?? 0,
    sourceId: property.id,
    quantity: property.unitCount ?? 1,
    tenant: property.status === "Alugado" ? "Locatário cadastrado na planilha" : undefined,
  } satisfies PropertyUnit));
  initialUnitsByBuilding.set(buildingId, unitsData);
  const units = properties.reduce((total, property) => total + (property.unitCount ?? 1), 0);
  const occupied = properties.reduce((total, property) => total + (property.status === "Alugado" ? property.unitCount ?? 1 : 0), 0);
  return {
    id: buildingId,
    name: first.buildingName,
    city: first.city,
    state: first.uf || "—",
    value: properties.reduce((total, property) => total + property.appraisal, 0),
    units,
    occupied,
    revenue: properties.reduce((total, property) => total + (property.rent ?? 0), 0),
    expenses: 0,
    status: buildingStatus(properties),
    image: `imported-${buildingId}`,
    unitsData,
    sourceRows: properties.length,
  };
});
