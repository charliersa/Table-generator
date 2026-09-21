// 從 index.html 抽出邏輯腳本，在 Node 裡建立一個可測試的 Component 實例。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function build() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('找不到 index.html 的邏輯腳本');

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        clear: () => m.clear(),
      };
    })(),
    document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, getContext: () => null }) },
    DCLogic: class { setState() {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // table-geom.js 會把 TableGeom 掛到 window 上
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'table-geom.js'), 'utf8'), sandbox, { filename: 'table-geom.js' });
  vm.runInContext(m[1] + '\n;globalThis.__api = { Component, MATS, LEGS, PRESETS, DIMS, SHEET_L, SHEET_W, TPL_MAX, TPL_STORE, PARAM_KEYS, PARAM_SCHEMA, AI_PARAM_GUIDE, SHEET_VIEWS, ZOOM_MIN, ZOOM_MAX, SHEET_BASE, fitPct };', sandbox, { filename: 'index.html' });

  const api = sandbox.__api;
  const app = new api.Component();
  app.setState = function (u) { this.state = { ...this.state, ...(typeof u === 'function' ? u(this.state) : u) }; };
  return { app, ...api, TableGeom: sandbox.TableGeom, localStorage: sandbox.localStorage };
}

module.exports = { build };
