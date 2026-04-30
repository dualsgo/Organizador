/* =============================================
   RDI Organizador – Application Logic
   ============================================= */

// ─── STATE ───────────────────────────────────
let allRows = [];       // parsed CSV rows (objects)
let filteredRows = [];  // after filters+search
let headers = [];       // column names
let currentPage = 1;
let pageSize = 25;
let sortCol = null;
let sortDir = 'asc';
let activeFilters = {};
let searchQuery = '';
let activeKpi = null; // id of the currently active KPI card

// ─── VISIBLE COLUMNS in TABLE ────────────────
const TABLE_COLS = [
  { key: 'Senha',              label: 'Senha' },
  { key: 'Usuário',            label: 'Paciente' },
  { key: 'Prestador',          label: 'Prestador' },
  { key: 'ADM',                label: 'ADM / Status' },
  { key: 'ACM',                label: 'ACM' },
  { key: 'Tipo Acomodação',    label: 'Acomodação' },
  { key: 'Tipo Internação',    label: 'Tipo Internação' },
  { key: 'ABORDAGEM',          label: 'Abordagem' },
  { key: 'Região',             label: 'Região' },
  { key: 'Auditor',            label: 'Auditor' },
  { key: 'DIVISÃO',            label: 'Divisão' },
  { key: 'Idade Usuário',      label: 'Idade' },
  { key: 'Qtde. Dias Internado', label: 'Dias' },
  { key: 'Data Internação',    label: 'Data Int.' },
];

// ─── FILTER COLUMNS ──────────────────────────
const FILTER_COLS = [
  { key: 'ACM',             label: 'ACM' },
  { key: 'ABORDAGEM',       label: 'Abordagem' },
  { key: 'Tipo Acomodação', label: 'Acomodação' },
  { key: 'Tipo Internação', label: 'Tipo Internação' },
  { key: 'Região',          label: 'Região' },
  { key: 'Auditor',         label: 'Auditor' },
  { key: 'DIVISÃO',         label: 'Divisão' },
  { key: 'REDE',            label: 'Rede' },
  { key: 'ONCO',            label: 'Onco' },
  { key: 'RENAL CRONICO',   label: 'Renal Crônico' },
  { key: 'REINTERNAÇÃO',    label: 'Reinternação' },
  { key: 'CAPTADO',         label: 'Captado' },
  { key: 'GLOSA',           label: 'Glosa' },
  { key: 'TOT',             label: 'TOT' },
];

// ─── CSV PARSER ───────────────────────────────
function parseCSV(text) {
  const delimiter = detectDelimiter(text);
  const lines = [];
  let inQuote = false;
  let cell = '';
  let row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuote && next === '"') { cell += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delimiter && !inQuote) {
      row.push(cell); cell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuote) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      lines.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) { row.push(cell); lines.push(row); }
  return lines;
}

function detectDelimiter(text) {
  const sample = text.slice(0, 2000);
  const commas = (sample.match(/,/g) || []).length;
  const semicolons = (sample.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

// ─── NORMALIZE VALUE ─────────────────────────
function norm(v) {
  if (!v) return '';
  v = v.trim();
  if (v === '#N/D' || v === '#N/A') return '';
  // Remove possible formula artifacts from SIGO
  if (v.startsWith('*=PROCV')) return '';
  return v;
}

// ─── LOAD CSV FILE ───────────────────────────
document.getElementById('csvInput').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const loading = showLoading();
  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      processCSV(evt.target.result, file.name);
    } catch (err) {
      console.error(err);
      alert('Erro ao processar o arquivo: ' + err.message);
    } finally {
      hideLoading(loading);
    }
  };
  // Try to detect encoding or default to latin1 which is common for Brazilian CSVs
  reader.readAsText(file, 'latin1');
});

function processCSV(text, filename) {
  window.currentDelimiter = detectDelimiter(text);
  window.currentFilename = filename;
  let lines = parseCSV(text);
  if (lines.length < 2) { alert('Arquivo vazio ou inválido.'); return; }

  // Detect SIGO vs Legacy
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (lines[i].some(c => c.trim().toUpperCase() === 'SENHA')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) headerIndex = 0;

  // ─── Store original structure for faithful export ─────────────────
  window.originalLines       = lines;        // full raw parsed array
  window.originalHeaderIndex = headerIndex;  // which line is the header
  window.rowToLineIndex      = {};           // allRows index → lines index
  // ──────────────────────────────────────────────────────────────────

  // Strip BOM and normalize headers
  const rawHeaders = lines[headerIndex].map((h, i) => {
    let clean = i === 0 ? h.replace(/^\uFEFF|^ÿ/, '') : h;
    return clean.trim().toUpperCase();
  });
  window.originalRawHeaders = rawHeaders;

  const isSigoFormat = rawHeaders.includes('NOME DO PACIENTE') || rawHeaders.includes('QUEM VALIDOU?');
  window.originalIsSigo = isSigoFormat;

  const SIGO_MAP = {
    'SENHA': 'Senha',
    'HOSPITAL': 'Prestador',
    'NOME DO PACIENTE': 'Usuário',
    'CARTEIRINHA': 'Código Usuário',
    'DATA DE INCLUSÃO': 'Data Internação',
    'PENDÊNCIA': 'Motivo',
    'QUEM VALIDOU?': 'Auditor',
    'STATUS': 'ENF',
    'HORARIO': 'Hora'
  };
  // Reverse map: internal key → original column name
  const SIGO_REVERSE = {};
  Object.entries(SIGO_MAP).forEach(([orig, internal]) => { SIGO_REVERSE[internal] = orig; });
  window.originalSigoReverse = SIGO_REVERSE;

  // Build rows — also track which original line each row came from
  let rowIndex = 0;
  allRows = [];
  for (let li = headerIndex + 1; li < lines.length; li++) {
    const r = lines[li];
    if (r.length <= 1 || norm(r[0]) === '') continue;
    const obj = {};
    if (isSigoFormat) {
      rawHeaders.forEach((h, i) => {
        const key = SIGO_MAP[h] || h;
        obj[key] = norm(r[i] || '');
      });
      if (!obj['Motivo']) obj['Motivo'] = obj['ABORDAGEM'];
      const statusText = (obj['ENF'] || '').toUpperCase();
      if (statusText.includes('UTI') || statusText.includes('CTI')) obj['ACM'] = 'UTI';
      else if (statusText.includes('APT') || statusText.includes('APART')) obj['ACM'] = 'APARTAMENTO';
      else if (statusText.includes('ENF')) obj['ACM'] = 'ENFERMARIA';
      else obj['ACM'] = 'N/A';
      if (statusText.includes('ALTA')) obj['ALTA'] = 'ALTA HOSPITALAR';
      else obj['ALTA'] = 'PERMANECE';
      if (!obj['ADM']) {
        obj['ADM'] = obj['ENF'] ? (obj['ENF'].length > 40 ? obj['ENF'].substring(0, 40) + '...' : obj['ENF']) : '–';
      }
      if (obj['Data Internação']) {
        const parts = obj['Data Internação'].split('/');
        if (parts.length === 3) {
          const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
          if (!isNaN(dateObj)) {
            const diff = Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));
            obj['Qtde. Dias Internado'] = Math.max(0, diff).toString();
          }
        }
      }
    } else {
      lines[headerIndex].forEach((h, i) => {
        const cleanH = i === 0 ? h.replace(/^\uFEFF|^ÿ/, '') : h;
        obj[cleanH] = norm(r[i] || '');
      });
    }
    window.rowToLineIndex[rowIndex] = li;  // track mapping
    allRows.push(obj);
    rowIndex++;
  }

  const dateMatch = filename.match(/(\d{2})[._](\d{2})/);
  const dateStr = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}` : '';
  document.getElementById('fileInfoText').textContent = `${filename}${dateStr ? ' – ' + dateStr : ''} (${allRows.length} registros)`;

  activeFilters = {};
  searchQuery = '';
  currentPage = 1;
  sortCol = null;
  sortDir = 'asc';
  document.getElementById('searchInput').value = '';

  headers = Object.keys(allRows[0] || {});
  buildFilters();
  buildTableHeader();
  applyFiltersAndSearch();

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
}

function loadSigoSample() {
  const sample = `ABORDAGEM;ENF;MEDICA;ONCO;RENAL CRONICO;GLOSA;TOT;CAPTADO;REINTERNAÇÃO;REGIÃO;AUDITOR;DIVISÃO;REDE
"*=PROCV(C2;Planilha1!$C$2:$AE$1000;8;0)";"*=PROCV(C2;Planilha1!$C$2:$AE$1000;9;0)";"*=PROCV(C2;Planilha1!$C$2:$AE$1000;10;0)";;
ILHA ADM ***** PENDÊNCIAS - RDI RIO DE JANEIRO
SENHA ;HOSPITAL;NOME DO PACIENTE ;CARTEIRINHA;DATA DE INCLUSÃO ;HORARIO ;PENDÊNCIA ;QUEM VALIDOU? ;STATUS
Y83477383;HOSPITAL SANTA IZABEL;VALDINEI DOS SANTOS QUINTANILHA;0M0LF000009016;02/03/2026;10:57;agendamento de remoção externa - RNM Cranio;MARIANA;"03/03 EDVALDO 09:17 Em contato com a Sra Luciana (esposa), me identifico e informo sobre o agendamento da remoção e que a ambulância está prevista para chegar as 10:30h no local de origem e 11:30h no local do exame."
Y75834186;HOSPITAL RIOMAR;ANA MARIA BRASIL AFFONSO;0P4KE007285000;04/03/2026;08:00;Acolher a família para trazer para rede própria para que agilize o tratamento da paciente. ;CAMILA ;"04/03 EDVALDO 14:46: mais uma tentativa de contato sem sucesso com os números cadastrados. PACIENTE EM UTI."`;
  processCSV(sample, 'RDI RIO DE JANEIRO SIGO 30.04.csv');
}

function loadSampleData() {
  const sample = `Senha,Prestador,Usuário,Código Usuário,Empresa Conveniada,Plano,ADM,ALTA,ACM,ABORDAGEM,ENF,MEDICA,ONCO,RENAL CRONICO,GLOSA,TOT,CAPTADO,REINTERNAÇÃO,Procedimento,Tipo Acomodação,Tipo Internação,Motivo,Data Internação,Idade Usuário,Qtde. Dias Internado,Região,Auditor,DIVISÃO,REDE
Z07736306,CASA SAUDE N S DO CARMO,ARIANE NAZARIO DO NASCIMENTO SILVA,0VV53000184004,MMP INTERMEDIACOES DE NEGOCIOS,PREMIUM 900.1 CARE CP PARCIAL,ALTA 27/03 CONF AUDITOR EXTERNO,ALTA HOSPITALAR,,PARTO,OB:26/03 ALTA:28/03,Alta amanhã 27/03,NÃO,NÃO,#N/D,N,N,NÃO,CESARIANA (FETO UNICO OU MULTIPLO),APARTAMENTO,Internação cirurgica de urgencia,QUADRO DE DBV + METROSSISTOLE PRESENTE,3/25/2026,33,2,METROPOLITANA,ELESSANDRO,PPO,DASA
Z05780134,CASA SAUDE N S DO CARMO,VALDEIA BRAGANCA MOTA,0NQSL001899007,ASSOCIACAO BEN PROF P A I E RI,MAX 400,ENF CONF DR ELESSANDRO,PERMANECE,ACM,FALTA DE VAGA RP,"79 ANOS .ITU. SEPSE.",27/03-Ag culturas. Segue meronem.,NÃO,NÃO,#N/D,N,CASE,NÃO,INTERNACAO CLINICA - GERAL E CLINICA MEDICA,ENFERMARIA,Internação clinica de urgência,DESIDRATACAO VOMITOS INCOERCIVEIS,3/23/2026,79,4,METROPOLITANA,ELESSANDRO,HMO,DASA
Y98418161,CHN HOSPITALAR NITEROI,AMOS GOMES,1ZUHP000202002,AUTO VIACAO 1001 LTDA,ADVANCE 600 CE ENF COP,UTI,PERMANECE,CTI,VIP NÃO ABORDADO,"62A LINFOMA CAV NASAL",27/03,D10IH--Transfusão,COM QT/RT,NÃO,#N/D,N,N,SIM-RC,INTERNACAO CLINICA - GERAL E CLINICA MEDICA,ENFERMARIA,Internação clinica de urgência,LINFOMA NASAL NK,3/16/2026,62,11,METROPOLITANA,ANDRE,PPO,DASA`;
  processCSV(sample, 'rdi_exemplo.csv');
}

// ─── KPI CARDS ───────────────────────────────
function buildKPIs(rows) {
  // Always compute counts from ALL rows so values don't collapse when filtered
  const base = allRows;
  const total = base.length;
  const reint = base.filter(r => r['REINTERNAÇÃO'] && r['REINTERNAÇÃO'].toUpperCase() === 'SIM').length;
  const utis = base.filter(r => r['ACM'] && r['ACM'].toUpperCase().includes('UTI')).length;
  const oncos = base.filter(r => r['ONCO'] && r['ONCO'].toUpperCase() !== 'NÃO' && r['ONCO'] !== '').length;

  // Avg dias from currently filtered rows
  const dias = rows.map(r => parseInt(r['Qtde. Dias Internado']) || 0).filter(d => d >= 0);
  const avgDias = dias.length ? (dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1) : '–';

  const kpis = [
    {
      id: 'total',
      label: 'Total Internações',
      value: total,
      sub: `em acompanhamento`,
      color: 'blue',
      tip: 'Clique para limpar filtros',
      filter: null
    },
    {
      id: 'uti',
      label: 'UTI / CTI',
      value: utis,
      sub: `pacientes críticos`,
      color: 'red',
      tip: 'Filtrar por UTI/CTI',
      filter: { key: '_uti', value: true }   // custom filter handled separately
    },
    {
      id: 'onco',
      label: 'Acompanham. Onco',
      value: oncos,
      sub: `com QT/RT`,
      color: 'purple',
      tip: 'Filtrar pacientes com acompanhamento oncológico',
      filter: { key: '_onco', value: true }  // custom filter
    },
    {
      id: 'reint',
      label: 'Reinternações',
      value: reint,
      sub: `neste período`,
      color: 'orange',
      tip: 'Filtrar reinternações',
      filter: { key: 'REINTERNAÇÃO', value: 'SIM' }
    },
    {
      id: 'avgdias',
      label: 'Média Dias Int.',
      value: avgDias,
      sub: `dias por paciente`,
      color: 'teal',
      tip: null   // informativo, sem filtro
    },
  ];

  document.getElementById('kpiSection').innerHTML = kpis.map(k => {
    const isActive = activeKpi === k.id;
    const clickable = k.filter !== undefined || k.id === 'total';
    return `
      <div
        class="kpi-card ${k.color}${isActive ? ' kpi-active' : ''}${clickable ? ' kpi-clickable' : ''}"
        ${clickable ? `onclick="applyKpiFilter('${k.id}')" title="${k.tip || ''}"`  : ''}
      >
        <div class="kpi-label">${k.label}${isActive ? ' <span class="kpi-active-dot">●</span>' : ''}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-sub">${k.sub}</div>
        ${clickable && !isActive ? '<div class="kpi-hint">clique para filtrar</div>' : ''}
        ${isActive ? '<div class="kpi-hint kpi-hint-active">filtro ativo · clique para limpar</div>' : ''}
      </div>`;
  }).join('');
}

// ─── HIGHLIGHTS & ALERTS ─────────────────────
function buildHighlights(rows) {
  const container = document.getElementById('highlightsSection');
  if (!rows || rows.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'grid';

  // 1. Critical Cases: UTI/CTI + Dias > 7
  const critical = rows.filter(r => {
    const acm = (r['ACM'] || '').toUpperCase();
    const dias = parseInt(r['Qtde. Dias Internado']) || 0;
    return (acm.includes('UTI') || acm.includes('CTI')) && dias >= 7;
  }).slice(0, 5);

  // 2. Long Stay Alert: Dias > 15
  const longStay = rows.filter(r => {
    const dias = parseInt(r['Qtde. Dias Internado']) || 0;
    return dias >= 15;
  }).slice(0, 5);

  container.innerHTML = `
    ${renderHighlightCard('Casos Críticos (UTI + 7d)', critical, 'critical', 'alert-circle', 'Dias')}
    ${renderHighlightCard('Longa Permanência (>15d)', longStay, 'warning', 'clock', 'Dias')}
  `;
}

function renderHighlightCard(title, items, type, icon, labelTag) {
  const iconSvg = icon === 'alert-circle' 
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    : icon === 'check-circle'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  return `
    <div class="highlight-card ${type}">
      <div class="highlight-header">
        ${iconSvg}
        <span>${title}</span>
      </div>
      <div class="highlight-list">
        ${items.length ? items.map(r => {
          const val = r['Qtde. Dias Internado'] || '0';
          const badgeClass = type === 'critical' ? 'badge-red-outline' : 'badge-yellow-outline';
          const idx = allRows.indexOf(r);
          return `
            <div class="highlight-item" onclick="openModal(${idx})">
              <div class="highlight-item-info">
                <div class="highlight-item-name">${r['Usuário'] || 'Paciente'}</div>
                <div class="highlight-item-sub">${r['Prestador'] || '–'}</div>
              </div>
              <div class="highlight-item-badge ${badgeClass}">${val}d</div>
            </div>
          `;
        }).join('') : '<div class="highlight-empty">Nenhum caso identificado</div>'}
      </div>
    </div>
  `;
}

// ─── CHARTS ──────────────────────────────────
function renderCharts(rows) {
  const container = document.getElementById('chartsSection');
  if (!rows || rows.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'grid';

  const total = rows.length;
  const avgDias = (rows.reduce((a, b) => a + (parseInt(b['Qtde. Dias Internado']) || 0), 0) / total).toFixed(1);
  
  const regioes = {};
  rows.forEach(r => { const v = r['Região'] || 'Não Inf.'; regioes[v] = (regioes[v] || 0) + 1; });
  const topRegiao = Object.entries(regioes).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';

  container.innerHTML = `
    <div class="charts-summary" style="grid-column: 1 / -1; padding: 16px; background: rgba(59,130,246,0.05); border-radius: var(--radius); border-left: 4px solid var(--accent); font-size: 14px; color: var(--text-2); display: flex; align-items: center; gap: 12px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:var(--accent)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>
        Resumo do Painel: <strong>${total}</strong> registros filtrados | 
        Média de permanência: <strong>${avgDias} dias</strong> | 
        Região predominante: <strong>${topRegiao}</strong>
      </span>
    </div>
  `;
}

// ─── KPI FILTER LOGIC ────────────────────────
function applyKpiFilter(kpiId) {
  // Toggle: clicking the active card clears the KPI filter
  if (activeKpi === kpiId || kpiId === 'total') {
    activeKpi = null;
    // Remove any KPI-injected keys from activeFilters
    delete activeKpi; // clear KPI context
    delete activeFilters['_uti'];
    delete activeFilters['_onco'];

    // But restore select-driven filters if user had set them
    // (they're cleared here for simplicity; selects already reset below)
    syncSelectsToFilters();
    currentPage = 1;
    applyFiltersAndSearch();
    return;
  }

  activeKpi = kpiId;

  // Clear any previous KPI-driven custom keys
  delete activeFilters['_uti'];
  delete activeFilters['_onco'];


  const kpiMap = {
    reint:     { key: 'REINTERNAÇÃO', value: 'SIM' },
    uti:       { key: '_uti',         value: true },
    onco:      { key: '_onco',        value: true },
  };

  const f = kpiMap[kpiId];
  if (f) activeFilters[f.key] = f.value;

  // Sync dropdowns to reflect (for normal keys)
  syncSelectsToFilters();
  currentPage = 1;
  applyFiltersAndSearch();

  // Scroll to table smoothly
  setTimeout(() => document.querySelector('.table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function syncSelectsToFilters() {
  FILTER_COLS.forEach(fc => {
    const el = document.getElementById('filter-' + fc.key);
    if (el) el.value = activeFilters[fc.key] || '';
  });
}

// ─── FILTERS ─────────────────────────────────
function buildFilters() {
  const grid = document.getElementById('filtersGrid');
  grid.innerHTML = FILTER_COLS.map(fc => {
    const vals = [...new Set(allRows.map(r => r[fc.key]).filter(v => v !== ''))].sort();
    return `
      <div class="filter-group">
        <label for="filter-${fc.key}">${fc.label}</label>
        <select id="filter-${fc.key}" onchange="setFilter('${fc.key}', this.value)">
          <option value="">Todos</option>
          ${vals.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>`;
  }).join('');
}

function setFilter(key, value) {
  if (value === '') delete activeFilters[key];
  else activeFilters[key] = value;
  currentPage = 1;
  applyFiltersAndSearch();
}

function clearAllFilters() {
  activeFilters = {};
  activeKpi = null;
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  FILTER_COLS.forEach(fc => {
    const el = document.getElementById('filter-' + fc.key);
    if (el) el.value = '';
  });
  currentPage = 1;
  applyFiltersAndSearch();
}

// ─── SEARCH ──────────────────────────────────
document.getElementById('searchInput').addEventListener('input', function () {
  searchQuery = this.value.toLowerCase();
  currentPage = 1;
  applyFiltersAndSearch();
});

// ─── FILTER + SEARCH LOGIC ───────────────────
function applyFiltersAndSearch() {
  filteredRows = allRows.filter(row => {
    for (const [key, val] of Object.entries(activeFilters)) {
      // Custom virtual keys
      if (key === '_uti') {
        if (!(row['ACM'] && row['ACM'].toUpperCase().includes('UTI'))) return false;
        continue;
      }
      if (key === '_onco') {
        if (!(row['ONCO'] && row['ONCO'] !== '')) return false;
        continue;
      }
      if (row[key] !== val) return false;
    }
    if (searchQuery) {
      const search = [
        row['Senha'], row['Usuário'], row['Prestador'],
        row['Empresa Conveniada'], row['Plano'], row['Procedimento'], row['Motivo']
      ].join(' ').toLowerCase();
      if (!search.includes(searchQuery)) return false;
    }
    return true;
  });

  if (sortCol) applySorting();
  buildKPIs(filteredRows);
  buildHighlights(filteredRows);
  renderCharts(filteredRows);
  renderTable();
  renderPagination();

  const total = filteredRows.length;
  document.getElementById('tableCount').textContent = `${total} registro${total !== 1 ? 's' : ''}`;
  document.getElementById('searchCount').textContent = searchQuery || Object.keys(activeFilters).length
    ? `${total} de ${allRows.length}` : '';
}

// ─── EXPORT ──────────────────────────────────
// Escapes a single cell value for CSV
function csvCell(val, delim) {
  val = (val === undefined || val === null) ? '' : String(val);
  if (val.includes(delim) || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    val = '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// Reconstruct the ORIGINAL file structure, writing back only the edited cells.
// All preamble rows, blank columns, and original column names are preserved.
function exportFullCopy() {
  if (!window.originalLines || allRows.length === 0) {
    alert('Nenhum arquivo carregado para exportar.');
    return;
  }

  const delim     = window.currentDelimiter || ',';
  const isSigo    = window.originalIsSigo;
  const rawHdrs   = window.originalRawHeaders || [];
  const reverse   = window.originalSigoReverse || {};
  const origLines = window.originalLines;  // reference — we mutate cells in place

  // Write edited data back into originalLines
  allRows.forEach((row, rowIdx) => {
    const lineIdx = window.rowToLineIndex[rowIdx];
    if (lineIdx === undefined) return;
    const line = origLines[lineIdx];  // array of cell strings

    rawHdrs.forEach((origColName, colIdx) => {
      if (colIdx >= line.length) return;
      // Which internal key corresponds to this original column?
      const internalKey = isSigo ? ({
        'SENHA': 'Senha', 'HOSPITAL': 'Prestador',
        'NOME DO PACIENTE': 'Usuário', 'CARTEIRINHA': 'Código Usuário',
        'DATA DE INCLUSÃO': 'Data Internação', 'PENDÊNCIA': 'Motivo',
        'QUEM VALIDOU?': 'Auditor', 'STATUS': 'ENF', 'HORARIO': 'Hora'
      }[origColName] || origColName) : origColName;

      if (row[internalKey] !== undefined) {
        line[colIdx] = row[internalKey];
      }
    });
  });

  // Re-serialize all original lines (preserving blank columns)
  const csvContent = origLines.map(line =>
    line.map(cell => csvCell(cell, delim)).join(delim)
  ).join('\r\n');

  const filename    = window.currentFilename || 'rdi_export.csv';
  const newFilename = filename.replace(/\.csv$/i, '') + '_editado.csv';

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = newFilename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('✅ Cópia fiel salva: ' + newFilename);
}

// Legacy filtered export (keeps old behaviour for partial exports)
function exportToCSV() {
  if (filteredRows.length === 0) return;
  const delim = window.currentDelimiter || ',';
  const csvHeaders = headers.map(h => csvCell(h, delim)).join(delim);
  const csvRows = filteredRows.map(row =>
    headers.map(h => csvCell(row[h] || '', delim)).join(delim)
  );
  const csvContent = '\uFEFF' + csvHeaders + '\n' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const filename = window.currentFilename || 'rdi_export.csv';
  link.download = filename.replace(/\.csv$/i, '') + '_filtrado.csv';
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── SORTING ─────────────────────────────────
function toggleSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }
  // Update header icons
  document.querySelectorAll('#tableHead th').forEach(th => {
    const sc = th.dataset.col;
    const icon = th.querySelector('.sort-icon');
    if (sc === col) {
      th.classList.add('sorted');
      icon.textContent = sortDir === 'asc' ? '↑' : '↓';
    } else {
      th.classList.remove('sorted');
      icon.textContent = '↕';
    }
  });
  applySorting();
  currentPage = 1;
  renderTable();
  renderPagination();
}

function applySorting() {
  filteredRows.sort((a, b) => {
    let va = a[sortCol] || '';
    let vb = b[sortCol] || '';
    // Numeric sort for dias/idade
    if (sortCol === 'Qtde. Dias Internado' || sortCol === 'Idade Usuário') {
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ─── TABLE ───────────────────────────────────
function buildTableHeader() {
  document.getElementById('tableHead').innerHTML = '<tr>' +
    TABLE_COLS.map(c => `
      <th data-col="${c.key}" onclick="toggleSort('${c.key}')">
        ${c.label} <span class="sort-icon">↕</span>
      </th>`).join('') +
    '</tr>';
}

function renderTable() {
  const start = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  document.getElementById('tableBody').innerHTML = pageRows.map((row, i) => `
    <tr onclick="openModal(${start + i})">
      ${TABLE_COLS.map(c => {
        const val = row[c.key];
        return `<td>${renderCell(c.key, val, row)}</td>`;
      }).join('')}
    </tr>
  `).join('') || `<tr><td colspan="${TABLE_COLS.length}" style="text-align:center;padding:40px;color:var(--text-3)">Nenhum registro encontrado</td></tr>`;
}

function renderCell(key, val, row) {
  val = val || '';
  let displayVal = val;

  // Search highlighting
  if (searchQuery && ['Senha', 'Usuário', 'Prestador'].includes(key)) {
    const idx = val.toLowerCase().indexOf(searchQuery);
    if (idx !== -1) {
      displayVal = val.substring(0, idx) +
        `<mark style="background:rgba(255,255,0,0.3);color:inherit;border-radius:2px">${val.substring(idx, idx + searchQuery.length)}</mark>` +
        val.substring(idx + searchQuery.length);
    }
  }

  switch (key) {
    case 'Senha':
      return `
        <div class="senha-cell">
          <span class="cell-senha">${displayVal}</span>
          <button class="btn-copy" onclick="copyToClipboard('${val}', event)" title="Copiar Senha">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>`;
    case 'Usuário':
      return `<span class="cell-user" title="${val}">${displayVal}</span>`;
    case 'ALTA': {
      const cls = val === 'ALTA HOSPITALAR' ? 'status-alta' : val === 'PERMANECE' ? 'status-permanece' : 'status-other';
      const lbl = val === 'ALTA HOSPITALAR' ? '↑ Alta' : val === 'PERMANECE' ? '⟳ Permanece' : val || '–';
      return val ? `<span class="status-badge ${cls}">${lbl}</span>` : '<span style="color:var(--text-3)">–</span>';
    }
    case 'ACM': {
      const upper = val.toUpperCase();
      const cls = upper.includes('UTI') || upper.includes('CTI') ? 'acm-uti'
        : upper.includes('APT') || upper.includes('APTO') ? 'acm-apt'
        : upper.includes('ENF') ? 'acm-enf' : 'acm-other';
      return val ? `<span class="status-badge ${cls}">${val}</span>` : '<span style="color:var(--text-3)">–</span>';
    }
    case 'ADM':
      return val ? `<div class="adm-cell"><span class="adm-dot"></span><span class="adm-text" title="${val}">${val}</span></div>` : '<span style="color:var(--text-3)">–</span>';
    case 'Prestador':
      return `<span class="cell-truncate" title="${val}">${displayVal || '<span style="color:var(--text-3)">–</span>'}</span>`;
    case 'Empresa Conveniada':
    case 'Tipo Internação':
    case 'ABORDAGEM':
    case 'Tipo Acomodação':
      return `<span class="cell-truncate" title="${val}">${val || '<span style="color:var(--text-3)">–</span>'}</span>`;
    case 'Qtde. Dias Internado': {
      const d = parseInt(val) || 0;
      const color = d >= 30 ? 'var(--danger)' : d >= 14 ? 'var(--warning)' : d >= 7 ? '#60a5fa' : 'var(--text-2)';
      return `<span style="color:${color};font-weight:600">${val || '0'}</span>`;
    }
    case 'Idade Usuário':
      return `<span style="font-weight:500">${val || '–'}</span>`;
    default:
      return val || '<span style="color:var(--text-3)">–</span>';
  }
}

// ─── PAGINATION ──────────────────────────────
function renderPagination() {
  const total = filteredRows.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  const nav = document.getElementById('pagination');
  let pages = '';
  const range = buildPageRange(currentPage, totalPages);
  range.forEach(p => {
    if (p === '…') {
      pages += `<span class="page-btn" style="cursor:default;opacity:0.4">…</span>`;
    } else {
      pages += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
    }
  });

  nav.innerHTML = `
    <span class="pagination-info">Exibindo ${start}–${end} de ${total}</span>
    <div class="pagination-controls">
      <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      ${pages}
      <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
      </button>
    </div>`;
}

function buildPageRange(cur, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (cur >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
  return [1, '…', cur-1, cur, cur+1, '…', total];
}

function goPage(p) {
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderTable();
  renderPagination();
  document.querySelector('.table-section')?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function changePageSize(val) {
  pageSize = parseInt(val);
  currentPage = 1;
  renderTable();
  renderPagination();
}

// ─── MODAL ───────────────────────────────────
// Labels amigáveis para cada chave do CSV
const FIELD_LABELS = {
  'Senha': 'Senha',
  'Prestador': 'Prestador',
  'Usuário': 'Paciente',
  'Código Usuário': 'Código Usuário',
  'Empresa Conveniada': 'Empresa Conveniada',
  'Plano': 'Plano',
  'ADM': 'ADM / Status',
  'ALTA': 'Alta',
  'ACM': 'ACM',
  'ABORDAGEM': 'Abordagem',
  'ENF': 'Evolução (ENF)',
  'MEDICA': 'Avaliação Médica',
  'ONCO': 'Acomp. Oncológico',
  'RENAL CRONICO': 'Renal Crônico',
  'GLOSA': 'Glosa',
  'TOT': 'TOT',
  'CAPTADO': 'Captado',
  'REINTERNAÇÃO': 'Reinternação',
  'Procedimento': 'Procedimento',
  'Tipo Acomodação': 'Tipo Acomodação',
  'Tipo Internação': 'Tipo Internação',
  'Motivo': 'Motivo da Internação',
  'Data Internação': 'Data Internação',
  'Idade Usuário': 'Idade',
  'Qtde. Dias Internado': 'Dias Internado',
  'Região': 'Região',
  'Auditor': 'Auditor',
  'DIVISÃO': 'Divisão',
  'REDE': 'Rede',
};

// Campos de texto longo (renderizados como área separada)
const LONG_TEXT_KEYS = new Set(['Motivo', 'ENF', 'MEDICA', 'ONCO']);

function openModal(globalIndex) {
  const row = filteredRows[globalIndex];
  if (!row) return;

  const actualIndex = allRows.indexOf(row);

  document.getElementById('modalTitle').textContent = row['Usuário'] || 'Paciente';
  document.getElementById('modalSubtitle').textContent =
    `Senha: ${row['Senha']} · ${row['Prestador']} · Data: ${row['Data Internação'] || '–'}`;

  // Separa campos curtos (grid) de campos longos (text area)
  const shortFields = [];
  const longFields  = [];

  for (const key of Object.keys(row)) {
    if (!key || key.trim() === '') continue;
    const val = row[key] || '';
    const isLong = LONG_TEXT_KEYS.has(key) || val.length > 120;
    if (isLong) {
      longFields.push({ key, label: FIELD_LABELS[key] || key, val });
    } else {
      shortFields.push({ key, label: FIELD_LABELS[key] || key, val });
    }
  }

  const grid = shortFields.map(f => `
    <div class="modal-field">
      <div class="modal-field-label">${f.label}</div>
      <input type="text" class="modal-input" data-key="${f.key}" value="${f.val}" placeholder="Não informado">
    </div>`).join('');

  const textAreas = longFields
    .map(f => `
      <div class="modal-text-area">
        <div class="modal-text-label">${f.label}</div>
        <textarea class="modal-textarea" data-key="${f.key}" rows="4">${f.val}</textarea>
      </div>`).join('');

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-grid">${grid}</div>
    ${textAreas}
    <div class="modal-footer">
      <button class="btn-save-row" onclick="saveRowChanges(${actualIndex})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Salvar Alterações
      </button>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
}

function saveRowChanges(index) {
  const row = allRows[index];
  if (!row) return;

  // 1. Update the in-memory row object
  const inputs = document.querySelectorAll('.modal-input, .modal-textarea');
  inputs.forEach(el => {
    const key = el.dataset.key;
    if (key) row[key] = el.value;
  });

  // 2. Write back to original raw lines (so export stays faithful)
  const lineIdx = window.rowToLineIndex ? window.rowToLineIndex[index] : undefined;
  if (lineIdx !== undefined && window.originalLines) {
    const rawHdrs = window.originalRawHeaders || [];
    const isSigo  = window.originalIsSigo;
    const line    = window.originalLines[lineIdx];
    const SIGO_MAP_LOCAL = {
      'SENHA': 'Senha', 'HOSPITAL': 'Prestador',
      'NOME DO PACIENTE': 'Usuário', 'CARTEIRINHA': 'Código Usuário',
      'DATA DE INCLUSÃO': 'Data Internação', 'PENDÊNCIA': 'Motivo',
      'QUEM VALIDOU?': 'Auditor', 'STATUS': 'ENF', 'HORARIO': 'Hora'
    };
    rawHdrs.forEach((origCol, colIdx) => {
      if (colIdx >= line.length) return;
      const internalKey = isSigo ? (SIGO_MAP_LOCAL[origCol] || origCol) : origCol;
      if (row[internalKey] !== undefined) line[colIdx] = row[internalKey];
    });
  }

  applyFiltersAndSearch();
  closeModal();
  showToast('✅ Alterações salvas — use "Salvar Cópia" para baixar o arquivo');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 100);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── LOADING ─────────────────────────────────
function showLoading() {
  const el = document.createElement('div');
  el.className = 'loading-overlay';
  el.innerHTML = `<div class="spinner"></div><div class="loading-text">Processando arquivo…</div>`;
  document.body.appendChild(el);
  return el;
}

function hideLoading(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ─── THEME ───────────────────────────────────
function toggleTheme() {
  const body = document.documentElement;
  const current = body.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', next);
  localStorage.setItem('rdi-theme', next);
}

// Load theme from storage
(function() {
  const saved = localStorage.getItem('rdi-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

function copyToClipboard(text, event) {
  event.stopPropagation();
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color:var(--success)"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => { btn.innerHTML = original; }, 2000);
  });
}
