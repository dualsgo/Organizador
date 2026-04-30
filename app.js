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
  { key: 'IA_ALTA',            label: 'IA: Chance Alta' },
  { key: 'Senha',              label: 'Senha' },
  { key: 'Usuário',            label: 'Paciente' },
  { key: 'Prestador',          label: 'Prestador' },
  { key: 'ADM',                label: 'ADM / Status' },
  { key: 'ALTA',               label: 'Alta' },
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
  { key: 'ALTA',            label: 'Alta' },
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
    } else if (ch === ',' && !inQuote) {
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

// ─── NORMALIZE VALUE ─────────────────────────
function norm(v) {
  if (!v) return '';
  v = v.trim();
  if (v === '#N/D' || v === '#N/A') return '';
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
  reader.readAsText(file, 'latin1');
});

function processCSV(text, filename) {
  const lines = parseCSV(text);
  if (lines.length < 2) { alert('Arquivo vazio ou inválido.'); return; }

  // Strip BOM from first header cell
  const rawHeaders = lines[0].map((h, i) => i === 0 ? h.replace(/^\uFEFF|^ÿ/, '') : h);
  headers = rawHeaders;

  // Build objects, skip empty rows (no Senha)
  allRows = lines.slice(1)
    .filter(r => r.length > 1 && norm(r[0]) !== '')
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = norm(r[i] || ''); });
      return obj;
    });

  // Update file info
  const dateMatch = filename.match(/(\d{2})[._](\d{2})/);
  const dateStr = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}` : '';
  document.getElementById('fileInfoText').textContent = `${filename}${dateStr ? ' – ' + dateStr : ''} (${allRows.length} registros)`;

  // Reset state
  activeFilters = {};
  searchQuery = '';
  currentPage = 1;
  sortCol = null;
  sortDir = 'asc';
  document.getElementById('searchInput').value = '';

  // Build UI
  buildFilters();
  buildTableHeader();
  applyFiltersAndSearch();

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
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
  const altas = base.filter(r => r['ALTA'] === 'ALTA HOSPITALAR').length;
  const permanece = base.filter(r => r['ALTA'] === 'PERMANECE').length;
  const utis = base.filter(r => r['ACM'] && r['ACM'].toUpperCase().includes('UTI')).length;
  const oncos = base.filter(r => r['ONCO'] && r['ONCO'] !== '').length;
  const reint = base.filter(r => r['REINTERNAÇÃO'] && r['REINTERNAÇÃO'].toUpperCase() === 'SIM').length;
  const aiHigh = base.filter(r => getAIAnalysis(r).score > 70 && r['ALTA'] !== 'ALTA HOSPITALAR').length;


  // Avg dias from currently filtered rows
  const dias = rows.map(r => parseInt(r['Qtde. Dias Internado']) || 0).filter(d => d >= 0);
  const avgDias = dias.length ? (dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1) : '–';

  const kpis = [
    {
      id: 'total',
      label: 'Total Internações',
      value: total,
      sub: `${altas} altas hoje`,
      color: 'blue',
      tip: 'Clique para limpar filtros',
      filter: null   // special: clears all KPI filters
    },
    {
      id: 'altas',
      label: 'Altas Hoje',
      value: altas,
      sub: `${((altas/total)*100||0).toFixed(0)}% do total`,
      color: 'green',
      tip: 'Filtrar por alta hospitalar',
      filter: { key: 'ALTA', value: 'ALTA HOSPITALAR' }
    },
    {
      id: 'permanece',
      label: 'Permanece',
      value: permanece,
      sub: `aguardando alta`,
      color: 'blue',
      tip: 'Filtrar por pacientes que permanecem',
      filter: { key: 'ALTA', value: 'PERMANECE' }
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
      id: 'aihigh',
      label: 'Alta Provável (IA)',
      value: aiHigh,
      sub: `score acima de 70%`,
      color: 'teal',
      tip: 'Filtrar pacientes com alta probabilidade de alta via IA',
      filter: { key: '_ai_high', value: true }
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
  }).slice(0, 3);

  // 2. High Discharge Prob: AI Score > 80
  const highDischarge = rows.filter(r => {
    const ai = getAIAnalysis(r);
    return ai.score >= 80 && r['ALTA'] !== 'ALTA HOSPITALAR';
  }).slice(0, 3);

  // 3. Long Stay Alert: Dias > 15
  const longStay = rows.filter(r => {
    const dias = parseInt(r['Qtde. Dias Internado']) || 0;
    return dias >= 15;
  }).slice(0, 3);

  container.innerHTML = `
    ${renderHighlightCard('Casos Críticos (UTI + 7d)', critical, 'critical', 'alert-circle', 'Dias')}
    ${renderHighlightCard('Probabilidade Alta (>80%)', highDischarge, 'success', 'check-circle', '% Alta')}
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
          const val = labelTag === '% Alta' ? getAIAnalysis(r).score : (r['Qtde. Dias Internado'] || '0');
          const badgeClass = type === 'critical' ? 'badge-red-outline' : type === 'success' ? 'badge-green-outline' : 'badge-yellow-outline';
          const idx = allRows.indexOf(r);
          return `
            <div class="highlight-item" onclick="openModal(${idx})">
              <div class="highlight-item-info">
                <div class="highlight-item-name">${r['Usuário'] || 'Paciente'}</div>
                <div class="highlight-item-sub">${r['Prestador'] || '–'}</div>
              </div>
              <div class="highlight-item-badge ${badgeClass}">${val}${labelTag === '% Alta' ? '%' : 'd'}</div>
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
    delete activeFilters['ALTA'];
    delete activeFilters['REINTERNAÇÃO'];
    delete activeFilters['_uti'];
    delete activeFilters['_onco'];
    delete activeFilters['_ai_high'];

    // But restore select-driven filters if user had set them
    // (they're cleared here for simplicity; selects already reset below)
    syncSelectsToFilters();
    currentPage = 1;
    applyFiltersAndSearch();
    return;
  }

  activeKpi = kpiId;

  // Clear any previous KPI-driven ALTA / REINTERNAÇÃO / custom keys
  delete activeFilters['ALTA'];
  delete activeFilters['REINTERNAÇÃO'];
  delete activeFilters['_uti'];
  delete activeFilters['_onco'];
  delete activeFilters['_ai_high'];


  const kpiMap = {
    altas:     { key: 'ALTA',         value: 'ALTA HOSPITALAR' },
    permanece: { key: 'ALTA',         value: 'PERMANECE' },
    reint:     { key: 'REINTERNAÇÃO', value: 'SIM' },
    uti:       { key: '_uti',         value: true },
    onco:      { key: '_onco',        value: true },
    aihigh:    { key: '_ai_high',     value: true },
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
      if (key === '_ai_high') {
        if (!(getAIAnalysis(row).score > 70)) return false;
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
function exportToCSV() {
  if (filteredRows.length === 0) return;
  const csvHeaders = headers.join(',');
  const csvRows = filteredRows.map(row => {
    return headers.map(h => {
      let val = row[h] || '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',');
  });
  const csvContent = "\uFEFF" + csvHeaders + "\n" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `rdi_filtrado_${new Date().toISOString().slice(0,10)}.csv`);
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
      va = parseInt(va) || 0; vb = parseInt(vb) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    // Special sort for IA_ALTA (virtual score)
    if (sortCol === 'IA_ALTA') {
      va = getAIAnalysis(a).score; vb = getAIAnalysis(b).score;
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
        const val = c.key === 'IA_ALTA' ? getAIAnalysis(row).score : row[c.key];
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
    case 'IA_ALTA': {
      const { score, label, color } = getAIAnalysis(row);
      return `
        <div class="ai-cell">
          <div class="ai-badge" style="border-color: ${color}; color: ${color}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ai-spark">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/>
            </svg>
            <span>${label}</span>
          </div>
          <div class="ai-progress-bg"><div class="ai-progress-bar" style="width: ${score}%; background: ${color}"></div></div>
        </div>
      `;
    }
    default:
      return val || '<span style="color:var(--text-3)">–</span>';
  }
}

// ─── AI ANALYSIS ENGINE ──────────────────────
function getAIAnalysis(row) {
  const enf = (row['ENF'] || '').toLowerCase();
  const med = (row['MEDICA'] || '').toLowerCase();
  const mot = (row['Motivo'] || '').toLowerCase();
  const text = `${enf} ${med} ${mot}`;

  if (!enf && !med && !mot) return { score: 0, label: 'Sem dados', color: 'var(--text-3)', reasons: ['Falta de informações clínicas para análise.'] };

  const positive = [
    { t: 'melhora', w: 15 }, { t: 'estável', w: 10 }, { t: 'estabilidade', w: 10 },
    { t: 'boa evolução', w: 15 }, { t: 'alta', w: 25 }, { t: 'proposta', w: 15 },
    { t: 'aceita dieta', w: 10 }, { t: 'afebril', w: 10 }, { t: 'deambula', w: 10 },
    { t: 'lúcido', w: 5 }, { t: 'orientado', w: 5 }, { t: 'concluído', w: 10 },
    { t: 'alta hospitalar', w: 30 }, { t: 'programada', w: 20 }
  ];

  const negative = [
    { t: 'piora', w: 25 }, { t: 'instável', w: 20 }, { t: 'grave', w: 20 },
    { t: 'crítico', w: 25 }, { t: 'febre', w: 15 }, { t: 'aguardando exames', w: 15 },
    { t: 'pendente', w: 10 }, { t: 'uti', w: 30 }, { t: 'cti', w: 30 },
    { t: 'desorientado', w: 15 }, { t: 'dor intensa', w: 15 }, { t: 'transferência', w: 10 }
  ];

  let score = 30; // base score
  const reasons = [];

  positive.forEach(p => {
    if (text.includes(p.t)) {
      score += p.w;
      if (p.w >= 15) reasons.push(`Indício de ${p.t}`);
    }
  });

  negative.forEach(n => {
    if (text.includes(n.t)) {
      score -= n.w;
      if (n.w >= 15) reasons.push(`Alerta: ${n.t}`);
    }
  });

  score = Math.max(5, Math.min(98, score));

  let label = 'Baixa';
  let color = 'var(--danger)';
  if (score > 70) { label = 'Alta'; color = 'var(--success)'; }
  else if (score > 40) { label = 'Média'; color = 'var(--warning)'; }

  return { score, label, color, reasons: reasons.slice(0, 3) };
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

  document.getElementById('modalTitle').textContent = row['Usuário'] || 'Paciente';
  document.getElementById('modalSubtitle').textContent =
    `Senha: ${row['Senha']} · ${row['Prestador']} · Data: ${row['Data Internação'] || '–'}`;

  // Separa campos curtos (grid) de campos longos (text area)
  const shortFields = [];
  const longFields  = [];

  // Itera TODAS as chaves presentes no objeto da linha
  // (inclui qualquer coluna presente no CSV, mesmo que futura)
  for (const key of Object.keys(row)) {
    if (!key || key.trim() === '') continue; // pula colunas sem nome
    const val = row[key] || '';
    const isLong = LONG_TEXT_KEYS.has(key) || val.length > 120;
    if (isLong) {
      longFields.push({ key, label: FIELD_LABELS[key] || key, val });
    } else {
      shortFields.push({ key, label: FIELD_LABELS[key] || key, val });
    }
  }

  // Render grid de campos curtos
  const grid = shortFields.map(f => `
    <div class="modal-field">
      <div class="modal-field-label">${f.label}</div>
      <div class="modal-field-value ${f.val ? '' : 'empty'}">${f.val || 'Não informado'}</div>
    </div>`).join('');

  // Render áreas de texto longo
  const textAreas = longFields
    .filter(f => f.val && f.val.length > 0)
    .map(f => `
      <div class="modal-text-area">
        <div class="modal-text-label">${f.label}</div>
        <div class="modal-text-content">${escapeHtml(f.val)}</div>
      </div>`).join('');

  // IA Insight Section
  const ai = getAIAnalysis(row);
  const aiSection = `
    <div class="modal-ai-insight">
      <div class="ai-insight-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ai-insight-icon">
          <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/>
        </svg>
        <span>Análise Preditiva de Alta</span>
        <span class="ai-insight-badge" style="background: ${ai.color}22; color: ${ai.color}">${ai.label} (${ai.score}%)</span>
      </div>
      <div class="ai-insight-body">
        <p>Com base na análise de Evolução e Avaliação Médica, o paciente apresenta <strong>${ai.label.toLowerCase()} possibilidade de alta</strong> no curto prazo.</p>
        ${ai.reasons.length ? `<ul class="ai-reasons">${ai.reasons.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
      </div>
    </div>
  `;

  document.getElementById('modalBody').innerHTML = `
    ${aiSection}
    <div class="modal-grid">${grid}</div>
    ${textAreas}
  `;

  document.getElementById('modalOverlay').classList.add('open');
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
