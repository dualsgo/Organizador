/**
 * RDI SIGO – Google Apps Script
 * ================================================
 * COMO USAR:
 *   1. Importe o CSV no Google Sheets:
 *      Arquivo > Importar > selecione o CSV > "Substituir planilha atual"
 *   2. No Google Sheets: Extensões > Apps Script
 *   3. Cole este código, salve (Ctrl+S) e execute "instalar"
 *   4. Recarregue a planilha — o menu "RDI SIGO" aparecerá no topo
 *
 * Ou execute diretamente: clique em "Executar" com a função "criarDashboard"
 */

// ── Menu personalizado ────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏥 RDI SIGO')
    .addItem('📊 Criar / Atualizar Dashboard', 'criarDashboard')
    .addSeparator()
    .addItem('💾 Exportar CSV para Google Drive', 'exportarCSV')
    .addItem('🔄 Recalcular KPIs', 'recalcularKpis')
    .addSeparator()
    .addItem('❓ Instruções', 'mostrarInstrucoes')
    .addToUi();
}

/** Instala o menu (executar uma vez após colar o código) */
function instalar() {
  onOpen();
  SpreadsheetApp.getUi().alert(
    'RDI SIGO instalado!',
    'O menu "🏥 RDI SIGO" aparecerá na barra de menus após recarregar a página.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ── Constantes ────────────────────────────────────────────────────────────
const DASH_NAME    = 'RDI Dashboard';
const FONTE_TITLE  = 'Segoe UI';

const SIGO_MAP = {
  'SENHA':            'Senha',
  'HOSPITAL':         'Prestador',
  'NOME DO PACIENTE': 'Paciente',
  'CARTEIRINHA':      'Carteirinha',
  'DATA DE INCLUSÃO': 'Data Inclusão',
  'HORARIO':          'Horário',
  'PENDÊNCIA':        'Pendência / Abordagem',
  'QUEM VALIDOU?':    'Auditor',
  'STATUS':           'Status / Evolução',
};

const COL_WIDTHS_SIGO = [110, 200, 220, 130, 100, 70, 380, 110, 420];

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────
function criarDashboard() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const src    = ss.getActiveSheet();

  // Lê todos os valores da aba ativa
  const allValues = src.getDataRange().getValues();
  const totalRows = allValues.length;
  const totalCols = allValues[0].length;

  // ── Detectar cabeçalho ───────────────────────────────────────────
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, totalRows); i++) {
    for (let j = 0; j < totalCols; j++) {
      if (String(allValues[i][j]).trim().toUpperCase() === 'SENHA') {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }

  if (headerIdx < 0) {
    SpreadsheetApp.getUi().alert(
      'Cabeçalho não encontrado',
      'Não foi possível encontrar uma coluna "SENHA" nas primeiras 15 linhas.\n\nVerifique se a aba ativa contém os dados do RDI SIGO.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  // ── Cabeçalhos originais ─────────────────────────────────────────
  const origHeaders = allValues[headerIdx].map(h => String(h).trim().toUpperCase());

  let numCols = 0;
  for (let j = 0; j < origHeaders.length; j++) {
    if (origHeaders[j] !== '') numCols = j + 1;
  }
  if (numCols > 30) numCols = 30;

  const isSigo = origHeaders.includes('NOME DO PACIENTE') || origHeaders.includes('QUEM VALIDOU?');

  // Cabeçalhos amigáveis
  const dashHeaders = origHeaders.slice(0, numCols).map(h => {
    if (isSigo && SIGO_MAP[h]) return SIGO_MAP[h];
    return h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
  });

  // Colunas extras para SIGO
  if (isSigo) {
    dashHeaders.push('ACM (Sintet.)', 'Dias Internado');
  }
  const totalDash = dashHeaders.length;

  // ── Coletar linhas de dados ──────────────────────────────────────
  const today     = new Date();
  const statusIdx = origHeaders.indexOf('STATUS');
  const dateIdx   = origHeaders.indexOf('DATA DE INCLUSÃO');

  const dataRows  = [];

  for (let i = headerIdx + 1; i < totalRows; i++) {
    const row   = allValues[i];
    const cell0 = String(row[0] ?? '').trim();

    if (cell0 === '' || cell0.startsWith('*=') || cell0.toUpperCase().startsWith('ILHA')) continue;

    const dashRow = row.slice(0, numCols).map(c => String(c ?? '').trim());

    if (isSigo) {
      // Sintetizar ACM
      const statusText = statusIdx >= 0 ? String(row[statusIdx] ?? '').toUpperCase() : '';
      let acm = 'N/A';
      if (statusText.includes('UTI') || statusText.includes('CTI')) acm = 'UTI / CTI';
      else if (statusText.includes('APART') || statusText.includes('APT'))  acm = 'Apartamento';
      else if (statusText.includes('ENF')) acm = 'Enfermaria';

      // Calcular dias
      let dias = '';
      if (dateIdx >= 0) {
        const rawDate = String(row[dateIdx] ?? '').trim();
        const parts   = rawDate.split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            const adm   = new Date(y, m - 1, d);
            const diff  = Math.floor((today.getTime() - adm.getTime()) / 86400000);
            dias        = Math.max(0, diff).toString();
          }
        }
      }

      dashRow.push(acm, dias);
    }

    dataRows.push(dashRow);
  }

  if (dataRows.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum dado encontrado após o cabeçalho.');
    return;
  }

  // ── Preparar / limpar aba Dashboard ─────────────────────────────
  let dash = ss.getSheetByName(DASH_NAME);
  if (dash) {
    dash.clearContents();
    dash.clearFormats();
    // Remover filtros se existir
    const existing = dash.getFilter();
    if (existing) existing.remove();
  } else {
    dash = ss.insertSheet(DASH_NAME, 1); // segunda posição
  }

  dash.setTabColor('#1E3A8A');

  // ── Linha 1 – Título ─────────────────────────────────────────────
  const titleCell = dash.getRange(1, 1, 1, totalDash);
  titleCell.merge();
  titleCell.setValue('RDI RIO DE JANEIRO – SIGO | Painel de Internações');
  titleCell.setBackground('#0F1629');
  titleCell.setFontColor('#60A5FA');
  titleCell.setFontSize(13);
  titleCell.setFontWeight('bold');
  titleCell.setFontFamily('Segoe UI');
  titleCell.setVerticalAlignment('middle');
  dash.setRowHeight(1, 30);

  // ── Linha 2 – KPIs resumo ────────────────────────────────────────
  const utiCount  = dataRows.filter(r => (r[totalDash - 2] || '').toString().includes('UTI')).length;
  const diasColI  = isSigo ? totalDash - 1 : -1;
  const longCount = diasColI >= 0
    ? dataRows.filter(r => parseInt(r[diasColI]) > 15).length
    : 0;

  const kpiText = `Total: ${dataRows.length}  |  UTI/CTI: ${utiCount}  |  Longa permanência (>15d): ${longCount}  |  Atualizado: ${Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}`;
  const kpiCell = dash.getRange(2, 1, 1, totalDash);
  kpiCell.merge();
  kpiCell.setValue(kpiText);
  kpiCell.setBackground('#1E3A5F');
  kpiCell.setFontColor('#93C5FD');
  kpiCell.setFontSize(10);
  kpiCell.setFontFamily('Segoe UI');
  kpiCell.setVerticalAlignment('middle');
  dash.setRowHeight(2, 22);

  // ── Linha 3 – Cabeçalho da tabela ───────────────────────────────
  const hdrRange = dash.getRange(3, 1, 1, totalDash);
  hdrRange.setValues([dashHeaders]);
  hdrRange.setBackground('#1E3A8A');
  hdrRange.setFontColor('#BFDBFE');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(10);
  hdrRange.setFontFamily('Segoe UI');
  hdrRange.setVerticalAlignment('middle');
  hdrRange.setWrap(false);
  dash.setRowHeight(3, 28);

  // ── Linhas de dados ──────────────────────────────────────────────
  const dataRange = dash.getRange(4, 1, dataRows.length, totalDash);
  dataRange.setValues(dataRows);
  dataRange.setFontFamily('Segoe UI');
  dataRange.setFontSize(10);
  dataRange.setVerticalAlignment('middle');

  // Cores alternadas por linha
  for (let r = 0; r < dataRows.length; r++) {
    const rowRange = dash.getRange(r + 4, 1, 1, totalDash);
    rowRange.setBackground(r % 2 === 0 ? '#111827' : '#1E293B');
    rowRange.setFontColor('#E2E8F0');
    dash.setRowHeight(r + 4, 22);
  }

  // ── Formatação condicional – UTI em vermelho ─────────────────────
  const acmColLetter = isSigo ? columnToLetter(totalDash - 1) : columnToLetter(9);
  const firstDataRow = 4;
  const lastDataRow  = 3 + dataRows.length;

  const rules = dash.getConditionalFormatRules();

  // Regra UTI
  const utiRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('UTI')
    .setBackground('#7F1D1D')
    .setFontColor('#FCA5A5')
    .setRanges([dash.getRange(firstDataRow, 1, dataRows.length, totalDash)])
    .build();
  rules.push(utiRule);

  // Regra Longa Permanência (dias > 15)
  if (diasColI >= 0) {
    const diasCol    = diasColI + 1;
    const diasLetter = columnToLetter(diasCol);
    const longRule   = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(15)
      .setBackground('#78350F')
      .setFontColor('#FDE68A')
      .setRanges([dash.getRange(firstDataRow, diasCol, dataRows.length, 1)])
      .build();
    rules.push(longRule);
  }

  dash.setConditionalFormatRules(rules);

  // ── Wrap text nas colunas longas ─────────────────────────────────
  const wrapCols = isSigo ? [7, 9] : [6, 7]; // 1-indexed
  wrapCols.forEach(c => {
    if (c <= totalDash) {
      dash.getRange(4, c, dataRows.length, 1).setWrap(true);
    }
  });

  // ── Larguras das colunas ─────────────────────────────────────────
  const widths = isSigo ? COL_WIDTHS_SIGO : [];
  widths.forEach((w, i) => {
    if (i < totalDash) dash.setColumnWidth(i + 1, w);
  });

  // ── Bordas ───────────────────────────────────────────────────────
  const fullTable = dash.getRange(3, 1, dataRows.length + 1, totalDash);
  fullTable.setBorder(true, true, true, true, true, true, '#334155', SpreadsheetApp.BorderStyle.SOLID);

  // ── Filtro nativo ────────────────────────────────────────────────
  dash.getRange(3, 1, dataRows.length + 1, totalDash).createFilter();

  // ── Congelar linhas (título + kpi + cabeçalho) ───────────────────
  dash.setFrozenRows(3);

  // ── Ocultar a aba original (opcional) ────────────────────────────
  // src.hideSheet();

  // ── Ativar dashboard ─────────────────────────────────────────────
  ss.setActiveSheet(dash);
  dash.getRange('A1').activate();

  SpreadsheetApp.getUi().alert(
    '✅ Dashboard criado!',
    `${dataRows.length} registros carregados.\nUTI/CTI: ${utiCount} | Longa permanência: ${longCount}\n\nEdite diretamente na tabela.\nUse "💾 Exportar CSV" para salvar no Drive.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ── Recalcular KPIs (sem recriar tudo) ───────────────────────────────────
function recalcularKpis() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(DASH_NAME);
  if (!dash) { SpreadsheetApp.getUi().alert('Execute "Criar Dashboard" primeiro.'); return; }

  const lastRow  = dash.getLastRow();
  const lastCol  = dash.getLastColumn();
  const dataRows = dash.getRange(4, 1, lastRow - 3, lastCol).getValues();

  const today    = new Date();
  let total = 0, utis = 0, longos = 0;

  for (const row of dataRows) {
    if (!row[0]) continue;
    total++;
    const acmCol = lastCol - 1; // penúltima
    const diaCol = lastCol;     // última
    if (String(row[acmCol - 1] ?? '').includes('UTI')) utis++;
    const d = parseInt(row[diaCol - 1]);
    if (!isNaN(d) && d > 15) longos++;
  }

  const kpiText = `Total: ${total}  |  UTI/CTI: ${utis}  |  Longa permanência (>15d): ${longos}  |  Atualizado: ${Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}`;
  dash.getRange(2, 1).setValue(kpiText);
}

// ── Exportar CSV para Google Drive ────────────────────────────────────────
function exportarCSV() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(DASH_NAME);
  if (!dash) { SpreadsheetApp.getUi().alert('Execute "Criar Dashboard" primeiro.'); return; }

  const lastRow = dash.getLastRow();
  const lastCol = dash.getLastColumn();

  // Exportar da linha 3 (cabeçalho) em diante
  const data = dash.getRange(3, 1, lastRow - 2, lastCol).getValues();

  const csvLines = data.map(row =>
    row.map(cell => {
      const v = String(cell ?? '');
      return (v.includes(';') || v.includes('"') || v.includes('\n'))
        ? '"' + v.replace(/"/g, '""') + '"'
        : v;
    }).join(';')
  );

  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // UTF-8 BOM para Excel

  const blob     = Utilities.newBlob(csvContent, 'text/csv', 'RDI_SIGO_editado.csv');
  const folder   = DriveApp.getRootFolder();
  const existing = folder.getFilesByName('RDI_SIGO_editado.csv');
  if (existing.hasNext()) existing.next().setTrashed(true);

  const file = folder.createFile(blob);
  const url  = file.getUrl();

  SpreadsheetApp.getUi().alert(
    '✅ CSV Exportado!',
    `Arquivo salvo no Google Drive:\n"RDI_SIGO_editado.csv"\n\nAcesse em: drive.google.com\n\nURL: ${url}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ── Instruções ────────────────────────────────────────────────────────────
function mostrarInstrucoes() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; background: #0f172a; color: #e2e8f0; }
      h2 { color: #60a5fa; }
      ol { padding-left: 20px; line-height: 2; }
      code { background: #1e293b; padding: 2px 6px; border-radius: 4px; color: #93c5fd; }
    </style>
    <h2>🏥 RDI SIGO – Instruções</h2>
    <ol>
      <li>Importe o CSV no Google Sheets:<br>
        <code>Arquivo → Importar → selecione o .csv</code></li>
      <li>Acesse:<br>
        <code>Extensões → Apps Script</code></li>
      <li>Cole o código e execute <code>instalar</code></li>
      <li>Recarregue a planilha → menu <b>🏥 RDI SIGO</b> aparece</li>
      <li>Clique em <b>Criar / Atualizar Dashboard</b></li>
      <li>Edite diretamente na tabela</li>
      <li>Use <b>Exportar CSV</b> para salvar no Drive</li>
    </ol>
  `)
  .setTitle('Instruções RDI SIGO')
  .setWidth(480)
  .setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Instruções');
}

// ── Utilitário: número de coluna → letra (ex: 1→A, 28→AB) ───────────────
function columnToLetter(col: number): string {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter    = String.fromCharCode(65 + rem) + letter;
    col       = Math.floor((col - 1) / 26);
  }
  return letter;
}
