# 🏥 RDI Organizador SIGO (`Organizador`) — Painel Executivo & Automação de Internações

Suíte administrativa e clínica para **organização, higienização, deduplicação e visualização executiva de relatórios de internações hospitalares (SIGO)**, contando com um **Dashboard Web Standalone** e scripts de automação para **Excel (VBA / Office Scripts)** e **Google Sheets (Apps Script)**.

---

## 🚀 Principais Componentes

### 1. 📊 Dashboard Web Executivo (`index.html`, `app.js`, `rdi_organizador_standalone.html`)
- **Importação Drag & Drop de CSV**: Processamento instantâneo 100% local no navegador.
- **Filtros Inteligentes e KPIs**: Indicadores por unidade hospitalar, especialidade, tempo de permanência, status de internação e busca rápida.
- **Tema Claro / Escuro e Sessão Persistente**: Retomada automática da última análise no navegador e exportação limpa.
- **Versão Standalone (`rdi_organizador_standalone.html`)**: Gerada por `build_standalone.js`, empacotando HTML, CSS e JS em um único arquivo portátil.

### 2. ⚙️ Automação de Planilhas Corporativas
- **`RDI_SIGO.bas` (Excel VBA)**: Macro completa para higienização, padronização de colunas e formatação automática no Microsoft Excel Desktop.
- **`RDI_SIGO_OfficeScript.ts` (Excel Online / Power Automate)**: Script TypeScript para automação moderna no Excel Web.
- **`RDI_SIGO_AppScript.gs` (Google Sheets)**: Automação equivalente para planilhas no Google Workspace.

---

## 📂 Estrutura do Repositório

```text
Organizador/
├── index.html                      # Interface web principal
├── app.js                          # Motor de parsing CSV, filtros e renderização do painel
├── style.css                       # Estilização responsiva com suporte a Dark/Light mode
├── build_standalone.js             # Empacotador Node.js para gerar a versão standalone
├── rdi_organizador_standalone.html # Aplicação completa em arquivo único
├── RDI_SIGO.bas                    # Módulo VBA para Microsoft Excel
├── RDI_SIGO_AppScript.gs           # Script para Google Sheets
└── RDI_SIGO_OfficeScript.ts        # Script TypeScript para Excel Online (Office Scripts)
```

---

## 💻 Como Utilizar

1. **Dashboard Web**: Abra `rdi_organizador_standalone.html` (ou `index.html`) no navegador e arraste o arquivo `.csv` exportado do SIGO.
2. **Recompilar versão Standalone**:
   ```bash
   node build_standalone.js
   ```

---

## 🔒 Privacidade e Conformidade (LGPD / Dados Sensíveis de Saúde)
Todo o processamento ocorre localmente na máquina do usuário. **Arquivos `.csv` ou planilhas contendo dados reais de pacientes e internações foram removidos do repositório** e nunca devem ser versionados.
