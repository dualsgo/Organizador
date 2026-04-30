/**
 * RDI SIGO – Office Script (TypeScript)
 * ================================================
 * COMO USAR:
 *   1. Abra o arquivo "RDI RIO DE JANEIRO SIGO.csv" no Excel
 *   2. No Excel Online: Automatizar > Novo Script
 *      No Excel Desktop (365): Automatizar > Editor de Código
 *   3. Cole este código e clique em Executar
 *
 * O script cria a aba "RDI Dashboard" com tabela editável e filtros.
 * Para salvar as edições de volta ao CSV: use Arquivo > Salvar uma cópia > CSV.
 */

function main(workbook: ExcelScript.Workbook): void {

  // ── 1. Ler dados da aba ativa (o CSV aberto) ────────────────
  const srcSheet = workbook.getActiveWorksheet();
  const used     = srcSheet.getUsedRange();

  if (!used) {
    console.log("❌ Planilha vazia.");
    return;
  }

  const raw: (string | number | boolean)[][] = used.getValues() as (string | number | boolean)[][];
  const totalRows = raw.length;
  const totalCols = raw[0].length;

  // ── 2. Encontrar linha de cabeçalho (onde está "SENHA") ─────
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, totalRows); i++) {
    for (let j = 0; j < totalCols; j++) {
      if (String(raw[i][j]).trim().toUpperCase() === "SENHA") {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }

  if (headerIdx < 0) {
    console.log("❌ Cabeçalho (SENHA) não encontrado nas primeiras 15 linhas.");
    return;
  }

  // ── 3. Colunas originais e mapeamento SIGO ──────────────────
  const origHeaders: string[] = raw[headerIdx].map(h => String(h).trim().toUpperCase());

  // Descobrir quantas colunas têm nome
  let numCols = 0;
  for (let j = 0; j < origHeaders.length; j++) {
    if (origHeaders[j] !== "") numCols = j + 1;
  }
  if (numCols > 30) numCols = 30;

  const isSigo = origHeaders.includes("NOME DO PACIENTE") || origHeaders.includes("QUEM VALIDOU?");

  const SIGO_MAP: Record<string, string> = {
    "SENHA":            "Senha",
    "HOSPITAL":         "Prestador",
    "NOME DO PACIENTE": "Paciente",
    "CARTEIRINHA":      "Carteirinha",
    "DATA DE INCLUSÃO": "Data Inclusão",
    "HORARIO":          "Horário",
    "PENDÊNCIA":        "Pendência / Abordagem",
    "QUEM VALIDOU?":    "Auditor",
    "STATUS":           "Status / Evolução",
  };

  // Cabeçalhos para o dashboard
  const dashHeaders: string[] = origHeaders.slice(0, numCols).map(h => {
    if (isSigo && SIGO_MAP[h]) return SIGO_MAP[h];
    return h.charAt(0) + h.slice(1).toLowerCase(); // sentence-case
  });

  // Colunas extras sintetizadas (SIGO)
  const extraCols: string[] = isSigo ? ["ACM (Sintet.)", "Dias Internado"] : [];
  const allDashHeaders = [...dashHeaders, ...extraCols];
  const totalDashCols  = allDashHeaders.length;

  // ── 4. Construir linhas de dados ────────────────────────────
  const dataRows: (string | number)[][] = [];
  const today = new Date();

  for (let i = headerIdx + 1; i < totalRows; i++) {
    const row = raw[i];
    const cell0 = String(row[0] ?? "").trim();

    // Pular linhas vazias e linhas de fórmula residual
    if (cell0 === "" || cell0.startsWith("*=") || cell0.startsWith("ILHA")) continue;

    const dashRow: (string | number)[] = [];

    // Colunas mapeadas
    for (let j = 0; j < numCols; j++) {
      dashRow.push(String(row[j] ?? "").trim());
    }

    // Sintetizar campos extras (apenas SIGO)
    if (isSigo) {
      // Índices dos campos fonte no origHeaders
      const statusIdx = origHeaders.indexOf("STATUS");
      const dateIdx   = origHeaders.indexOf("DATA DE INCLUSÃO");

      const statusText = statusIdx >= 0 ? String(row[statusIdx] ?? "").toUpperCase() : "";
      let acm = "N/A";
      if (statusText.includes("UTI") || statusText.includes("CTI")) acm = "UTI / CTI";
      else if (statusText.includes("APART") || statusText.includes("APT")) acm = "Apartamento";
      else if (statusText.includes("ENF")) acm = "Enfermaria";

      let dias: number | string = "";
      if (dateIdx >= 0) {
        const rawDate = String(row[dateIdx] ?? "").trim();
        // Formato DD/MM/YYYY
        const parts = rawDate.split("/");
        if (parts.length === 3) {
          const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            const admDate = new Date(y, m - 1, d);
            dias = Math.max(0, Math.floor((today.getTime() - admDate.getTime()) / 86400000));
          }
        }
      }

      dashRow.push(acm, dias);
    }

    dataRows.push(dashRow);
  }

  if (dataRows.length === 0) {
    console.log("❌ Nenhum dado encontrado após o cabeçalho.");
    return;
  }

  // ── 5. Criar / limpar aba "RDI Dashboard" ──────────────────
  const DASH_NAME = "RDI Dashboard";
  let dash = workbook.getWorksheet(DASH_NAME);

  if (dash) {
    // Remover tabelas existentes antes de limpar
    dash.getTables().forEach(t => t.delete());
    dash.getUsedRange()?.clear();
  } else {
    dash = workbook.addWorksheet(DASH_NAME);
    // Mover para logo após a aba fonte
    const sheets = workbook.getWorksheets();
    if (sheets.length > 1) {
      dash.setPosition(1);
    }
  }

  // ── 6. Escrever cabeçalho e dados ──────────────────────────
  const headerRange = dash.getRangeByIndexes(0, 0, 1, totalDashCols);
  headerRange.setValues([allDashHeaders]);

  const dataRange = dash.getRangeByIndexes(1, 0, dataRows.length, totalDashCols);
  dataRange.setValues(dataRows);

  // ── 7. Criar Tabela Excel (filtros automáticos) ─────────────
  const tableRange = dash.getRangeByIndexes(0, 0, dataRows.length + 1, totalDashCols);
  const table      = dash.addTable(tableRange, true);
  table.setName("RDI_SIGO");
  table.setShowTotalsRow(false);

  // Estilo da tabela (escuro disponível no Excel)
  table.setPredefinedTableStyle("TableStyleDark1");

  // ── 8. Formatar colunas ─────────────────────────────────────
  // Larguras por posição (adaptado para SIGO)
  const colWidths: Record<number, number> = {
    0: 100, // Senha
    1: 200, // Prestador / Hospital
    2: 220, // Paciente
    3: 130, // Carteirinha
    4: 100, // Data
    5:  70, // Horário
    6: 350, // Pendência
    7: 110, // Auditor
    8: 380, // Status
  };

  for (const [col, width] of Object.entries(colWidths)) {
    const colNum = parseInt(col);
    if (colNum < totalDashCols) {
      dash.getRangeByIndexes(0, colNum, dataRows.length + 1, 1)
          .getFormat()
          .setColumnWidth(width);
    }
  }

  // Wrap text nas colunas longas (pendência e status)
  const longCols = isSigo ? [6, 8] : [5, 6];
  for (const c of longCols) {
    if (c < totalDashCols) {
      dash.getRangeByIndexes(1, c, dataRows.length, 1)
          .getFormat()
          .setWrapText(true);
    }
  }

  // Altura das linhas de dados
  dash.getRangeByIndexes(1, 0, dataRows.length, 1)
      .getFormat()
      .setRowHeight(48);

  // ── 9. Congelar cabeçalho ───────────────────────────────────
  dash.getFreezePanes().freezeRows(1);

  // ── 10. Linha de resumo no topo (acima da tabela) ───────────
  // Inserir 2 linhas no topo para KPIs
  dash.getRangeByIndexes(0, 0, 1, 1).insert(ExcelScript.InsertShiftDirection.down);
  dash.getRangeByIndexes(0, 0, 1, 1).insert(ExcelScript.InsertShiftDirection.down);

  // Calcular KPIs básicos
  const totalPac = dataRows.length;
  let utiCount   = 0;
  let longCount  = 0; // >15 dias
  const diasColIdx = isSigo ? totalDashCols - 1 : -1;

  for (const row of dataRows) {
    const acmSynth = isSigo ? String(row[totalDashCols - 2] ?? "") : String(row[8] ?? "");
    if (acmSynth.includes("UTI") || acmSynth.includes("CTI")) utiCount++;

    if (diasColIdx >= 0) {
      const d = Number(row[diasColIdx]);
      if (!isNaN(d) && d > 15) longCount++;
    }
  }

  // Linha 0: Título
  const titleCell = dash.getRangeByIndexes(0, 0, 1, totalDashCols);
  titleCell.merge();
  titleCell.setValue("RDI RIO DE JANEIRO – SIGO | Painel de Internações");
  titleCell.getFormat().getFill().setColor("#0F1629");
  titleCell.getFormat().getFont().setColor("#60A5FA");
  titleCell.getFormat().getFont().setBold(true);
  titleCell.getFormat().getFont().setSize(13);
  titleCell.getFormat().setRowHeight(28);
  titleCell.getFormat().setHorizontalAlignment(ExcelScript.HorizontalAlignment.left);
  titleCell.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.center);
  titleCell.getFormat().getFont().setName("Segoe UI");

  // Linha 1: KPIs resumo
  const kpiLine = `Total: ${totalPac}  |  UTI/CTI: ${utiCount}  |  Longa permanência (>15d): ${longCount}  |  Gerado em: ${today.toLocaleDateString("pt-BR")}`;
  const kpiCell = dash.getRangeByIndexes(1, 0, 1, totalDashCols);
  kpiCell.merge();
  kpiCell.setValue(kpiLine);
  kpiCell.getFormat().getFill().setColor("#1E3A5F");
  kpiCell.getFormat().getFont().setColor("#93C5FD");
  kpiCell.getFormat().getFont().setSize(10);
  kpiCell.getFormat().setRowHeight(20);
  kpiCell.getFormat().setHorizontalAlignment(ExcelScript.HorizontalAlignment.left);
  kpiCell.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.center);
  kpiCell.getFormat().getFont().setName("Segoe UI");

  // ── 11. Ativar e posicionar ─────────────────────────────────
  dash.activate();
  dash.getRange("A1").select();

  console.log(`✅ RDI Dashboard criado com sucesso!`);
  console.log(`   📋 Registros carregados: ${totalPac}`);
  console.log(`   🏥 UTI / CTI: ${utiCount}`);
  console.log(`   ⏳ Longa permanência (>15d): ${longCount}`);
  console.log(`   📅 Formato detectado: ${isSigo ? "SIGO (ponto-e-vírgula)" : "Legacy (vírgula)"}`);
  console.log(`\n   Edite diretamente na tabela.`);
  console.log(`   Para exportar: Arquivo > Salvar uma cópia > CSV (*.csv)`);
}
