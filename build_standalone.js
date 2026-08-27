/**
 * Build Script: Generates a single-file standalone offline version of RDI Organizador
 * Run with: node build_standalone.js
 */

const fs = require('fs');
const path = require('path');

function buildStandalone() {
  console.log('📦 Iniciando geração da versão Standalone 100% Offline...');

  const baseDir = __dirname;
  const htmlPath = path.join(baseDir, 'index.html');
  const cssPath = path.join(baseDir, 'style.css');
  const jsPath = path.join(baseDir, 'app.js');
  const outputPath = path.join(baseDir, 'rdi_organizador_standalone.html');

  if (!fs.existsSync(htmlPath) || !fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
    console.error('❌ Erro: Arquivos fonte não encontrados.');
    process.exit(1);
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Inline CSS
  html = html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']style\.css["']\s*\/?>/i,
    `<style>\n${css}\n</style>`
  );

  // Inline JS
  html = html.replace(
    /<script\s+src=["']app\.js["']><\/script>/i,
    `<script>\n${js}\n</script>`
  );

  // Strip external google fonts if any remaining
  html = html.replace(/<link\s+rel=["']preconnect["'][^>]*>/gi, '');
  html = html.replace(/<link\s+href=["']https:\/\/fonts\.googleapis\.com[^>]*>/gi, '');

  fs.writeFileSync(outputPath, html, 'utf8');

  const stats = fs.statSync(outputPath);
  const sizeKb = (stats.size / 1024).toFixed(1);

  console.log(`✅ Versão standalone gerada com sucesso!`);
  console.log(`📄 Arquivo: ${outputPath}`);
  console.log(`📊 Tamanho: ${sizeKb} KB (Single-file, 100% autônomo e offline)`);
}

buildStandalone();
