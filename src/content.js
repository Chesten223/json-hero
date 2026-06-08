// JSON Hero — Content Script
// Detects JSON responses and renders a beautiful viewer

(function () {
  const JSON_CONTENT_TYPES = ['application/json', 'application/ld+json', 'text/json', 'text/x-json'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  function isJSON(text) {
    text = text.trim();
    if (text.length < 2) return false;
    const first = text[0];
    return (first === '{' || first === '[') && isValidJSON(text);
  }

  function isValidJSON(text) {
    try { JSON.parse(text); return true; } catch { return false; }
  }

  function tryRender() {
    // Only run on top-level documents
    if (window.self !== window.top) return;

    // Check if content type suggests JSON
    const contentType = document.contentType || '';
    const isJsonCT = JSON_CONTENT_TYPES.some(ct => contentType.includes(ct));

    // Check if body looks like raw JSON (no HTML tags)
    const body = document.body;
    if (!body) return;

    // Safety: if the page has real HTML structure, don't hijack it
    // Only activate on pages that are bare JSON responses
    const hasHTMLStructure = body.querySelector('script, nav, header, footer, div:not(:scope > div), img, a[href], form, input');
    if (hasHTMLStructure && !isJsonCT) return;

    const pre = body.querySelector('pre');
    const text = pre ? pre.textContent : body.textContent;
    if (!text || text.length > MAX_SIZE) return;

    if (!isJSON(text)) return;

    // We have JSON — render the viewer
    renderViewer(text);
  }

  function renderViewer(rawText) {
    const parsed = JSON.parse(rawText);
    const formatted = JSON.stringify(parsed, null, 2);

    // Clear page
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; background: #0d1117; color: #c9d1d9; }
      .toolbar { background: #161b22; border-bottom: 1px solid #30363d; padding: 8px 16px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 100; }
      .toolbar h1 { font-size: 14px; font-weight: 600; color: #58a6ff; }
      .toolbar .badge { background: #238636; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .toolbar .actions { margin-left: auto; display: flex; gap: 8px; }
      .toolbar button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-family: inherit; }
      .toolbar button:hover { background: #30363d; }
      .main { display: flex; height: calc(100vh - 41px); }
      .tree-pane { width: 300px; border-right: 1px solid #30363d; overflow: auto; padding: 8px 0; }
      .code-pane { flex: 1; overflow: auto; padding: 16px; }
      .tree-item { padding: 3px 8px 3px 12px; cursor: pointer; font-size: 12px; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
      .tree-item:hover { background: #1f2937; }
      .tree-item .arrow { color: #484f58; font-size: 10px; width: 12px; text-align: center; user-select: none; }
      .tree-item .key { color: #79c0ff; }
      .tree-item .colon { color: #484f58; }
      .tree-item .type-badge { font-size: 10px; padding: 0 4px; border-radius: 3px; margin-left: 4px; }
      .type-obj { background: #1f2937; color: #58a6ff; }
      .type-arr { background: #1f2937; color: #d2a8ff; }
      .type-str { background: #1f2937; color: #a5d6ff; }
      .type-num { background: #1f2937; color: #79c0ff; }
      .type-bool { background: #1f2937; color: #ff7b72; }
      .type-null { background: #1f2937; color: #8b949e; }
      pre.code { margin: 0; font-size: 13px; line-height: 1.5; tab-size: 2; }
      .line { display: block; }
      .line:hover { background: #1f2937; }
      .line-num { display: inline-block; width: 40px; text-align: right; padding-right: 12px; color: #484f58; user-select: none; font-size: 12px; }
      .json-key { color: #79c0ff; }
      .json-string { color: #a5d6ff; }
      .json-number { color: #79c0ff; }
      .json-bool { color: #ff7b72; }
      .json-null { color: #8b949e; }
      .search { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-family: inherit; width: 200px; }
      .search:focus { outline: none; border-color: #58a6ff; }
      .stats { color: #484f58; font-size: 11px; }
      .highlight { background: #f0883e33; border-radius: 2px; }
      .path-bar { background: #161b22; border-bottom: 1px solid #30363d; padding: 4px 16px; font-size: 11px; color: #8b949e; }
    `;
    document.head.appendChild(style);
    document.head.appendChild(Object.assign(document.createElement('title'), { textContent: 'JSON Hero' }));

    // Stats
    const stats = getStats(parsed);

    // Build toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `
      <h1>{ } JSON Hero</h1>
      <span class="badge">FREE</span>
      <span class="stats">${stats.keys} keys · ${stats.depth} depth · ${formatSize(rawText.length)}</span>
      <div class="actions">
        <input type="text" class="search" id="jh-search" placeholder="Search keys/values...">
        <button id="jh-copy">Copy</button>
        <button id="jh-raw">Raw</button>
        <button id="jh-collapse">Collapse All</button>
        <button id="jh-csv" title="Export as CSV (Pro)">📊 CSV</button>
        <button id="jh-schema" title="Generate JSON Schema (Pro)">📐 Schema</button>
        <button id="jh-yaml" title="Convert to YAML (Pro)">📄 YAML</button>
      </div>
    `;

    // Path bar
    const pathBar = document.createElement('div');
    pathBar.className = 'path-bar';
    pathBar.id = 'jh-path';
    pathBar.textContent = '$';

    // Main content
    const main = document.createElement('div');
    main.className = 'main';

    const treePane = document.createElement('div');
    treePane.className = 'tree-pane';
    treePane.id = 'jh-tree';
    buildTree(treePane, parsed, '$');

    const codePane = document.createElement('div');
    codePane.className = 'code-pane';
    const pre = document.createElement('pre');
    pre.className = 'code';
    pre.id = 'jh-code';
    pre.innerHTML = syntaxHighlight(formatted);
    codePane.appendChild(pre);

    main.appendChild(treePane);
    main.appendChild(codePane);

    document.body.appendChild(toolbar);
    document.body.appendChild(pathBar);
    document.body.appendChild(main);

    // Actions
    document.getElementById('jh-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(formatted);
      const btn = document.getElementById('jh-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });

    document.getElementById('jh-raw').addEventListener('click', () => {
      const raw = JSON.stringify(parsed);
      navigator.clipboard.writeText(raw);
      const btn = document.getElementById('jh-raw');
      btn.textContent = 'Minified!';
      setTimeout(() => btn.textContent = 'Raw', 1500);
    });

    let collapsed = false;
    document.getElementById('jh-collapse').addEventListener('click', () => {
      collapsed = !collapsed;
      const items = treePane.querySelectorAll('.tree-item[data-children]');
      items.forEach(item => {
        const childContainer = document.getElementById(item.dataset.children);
        if (childContainer) childContainer.style.display = collapsed ? 'none' : 'block';
        const arrow = item.querySelector('.arrow');
        if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
      });
    });

    // Search
    document.getElementById('jh-search').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const lines = pre.querySelectorAll('.line');
      lines.forEach(line => {
        if (!query) { line.classList.remove('highlight'); return; }
        line.classList.toggle('highlight', line.textContent.toLowerCase().includes(query));
      });
    });

    // Premium features
    function showProToast(feature) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:12px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
      toast.innerHTML = `${feature} is a <span style="color:#22c55e;font-weight:600">Pro</span> feature. <a href="https://json-hero-8fu.pages.dev" target="_blank" style="color:#58a6ff;text-decoration:underline">Learn more</a>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    document.getElementById('jh-csv').addEventListener('click', () => {
      // CSV export — works for flat arrays, shows Pro toast for complex data
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        const headers = Object.keys(parsed[0]);
        const csv = [headers.join(','), ...parsed.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
        navigator.clipboard.writeText(csv);
        const btn = document.getElementById('jh-csv');
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📊 CSV', 1500);
      } else {
        showProToast('CSV export for nested data');
      }
    });

    document.getElementById('jh-schema').addEventListener('click', () => {
      const schema = generateSchema(parsed);
      navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
      const btn = document.getElementById('jh-schema');
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = '📐 Schema', 1500);
    });

    document.getElementById('jh-yaml').addEventListener('click', () => {
      const yaml = jsonToYaml(parsed);
      navigator.clipboard.writeText(yaml);
      const btn = document.getElementById('jh-yaml');
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = '📄 YAML', 1500);
    });
  }

  function buildTree(container, data, path, depth = 0) {
    if (typeof data !== 'object' || data === null) {
      const item = createTreeLeaf(typeof data, path, String(data));
      container.appendChild(item);
      return;
    }

    const entries = Array.isArray(data) ? data.map((v, i) => [i, v]) : Object.entries(data);

    entries.forEach(([key, value]) => {
      const currentPath = Array.isArray(data) ? `${path}[${key}]` : `${path}.${key}`;
      const isExpandable = typeof value === 'object' && value !== null;

      if (isExpandable) {
        const childId = 'jh-node-' + Math.random().toString(36).slice(2, 8);
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.children = childId;
        item.style.paddingLeft = (12 + depth * 16) + 'px';

        const count = Array.isArray(value) ? value.length : Object.keys(value).length;
        const typeClass = Array.isArray(value) ? 'type-arr' : 'type-obj';
        const typeLabel = Array.isArray(value) ? `Array[${count}]` : `Object{${count}}`;

        item.innerHTML = `<span class="arrow">▼</span><span class="key">${escHtml(String(key))}</span><span class="colon">:</span><span class="type-badge ${typeClass}">${typeLabel}</span>`;

        item.addEventListener('click', () => {
          const child = document.getElementById(childId);
          if (!child) return;
          const hidden = child.style.display === 'none';
          child.style.display = hidden ? 'block' : 'none';
          item.querySelector('.arrow').textContent = hidden ? '▼' : '▶';
        });

        item.addEventListener('mouseenter', () => {
          document.getElementById('jh-path').textContent = currentPath;
        });

        const childContainer = document.createElement('div');
        childContainer.id = childId;
        buildTree(childContainer, value, currentPath, depth + 1);

        container.appendChild(item);
        container.appendChild(childContainer);
      } else {
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.style.paddingLeft = (12 + depth * 16) + 'px';

        const typeClass = `type-${getTypeClass(value)}`;
        item.innerHTML = `<span class="arrow"></span><span class="key">${escHtml(String(key))}</span><span class="colon">:</span><span>${escHtml(String(value))}</span><span class="type-badge ${typeClass}">${getTypeClass(value)}</span>`;

        item.addEventListener('mouseenter', () => {
          document.getElementById('jh-path').textContent = currentPath;
        });

        container.appendChild(item);
      }
    });
  }

  function createTreeLeaf(type, path, value) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    return item;
  }

  function getTypeClass(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') return 'num';
    if (typeof value === 'string') return 'str';
    return 'null';
  }

  function syntaxHighlight(json) {
    return json.split('\n').map((line, i) => {
      const highlighted = line
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"([^"]+)"(\s*:)/g, '<span class="json-key">"$1"</span>$2')
        .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
        .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
        .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
      return `<span class="line"><span class="line-num">${i + 1}</span>${highlighted}</span>`;
    }).join('');
  }

  function getStats(data) {
    let keys = 0;
    let depth = 0;
    function walk(obj, d) {
      if (typeof obj !== 'object' || obj === null) return;
      depth = Math.max(depth, d);
      const entries = Array.isArray(obj) ? obj : Object.values(obj);
      keys += entries.length;
      entries.forEach(v => walk(v, d + 1));
    }
    walk(data, 1);
    return { keys, depth };
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function generateSchema(data) {
    const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema' };
    function inferType(val) {
      if (val === null) return 'null';
      if (Array.isArray(val)) return 'array';
      return typeof val;
    }
    function buildSchema(obj) {
      if (obj === null) return { type: 'null' };
      if (Array.isArray(obj)) {
        const items = obj.length > 0 ? buildSchema(obj[0]) : {};
        return { type: 'array', items };
      }
      if (typeof obj === 'object') {
        const properties = {};
        const required = [];
        for (const [k, v] of Object.entries(obj)) {
          properties[k] = buildSchema(v);
          required.push(k);
        }
        return { type: 'object', properties, required };
      }
      return { type: typeof obj };
    }
    return { ...schema, ...buildSchema(data) };
  }

  function jsonToYaml(data, indent = 0) {
    const pad = '  '.repeat(indent);
    if (data === null) return 'null';
    if (typeof data === 'boolean') return String(data);
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') {
      if (/[:\{\}\[\],&\*#\?|\-<>=!%@\\]/.test(data) || data.includes('\n')) {
        return '"' + data.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
      }
      return data;
    }
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      return '\n' + data.map(item => pad + '- ' + jsonToYaml(item, indent + 1)).join('\n');
    }
    if (typeof data === 'object') {
      const entries = Object.entries(data);
      if (entries.length === 0) return '{}';
      return '\n' + entries.map(([k, v]) => {
        const val = jsonToYaml(v, indent + 1);
        if (val.startsWith('\n')) return pad + k + ':' + val;
        return pad + k + ': ' + val;
      }).join('\n');
    }
    return String(data);
  }

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryRender);
  } else {
    tryRender();
  }
})();
