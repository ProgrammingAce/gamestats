const state = {
  games: [],
  filteredGames: [],
  sortColumn: 'size',
  sortDirection: 'desc',
  filter: '',
  sse: null,
  lastScanDuration: null,
  customPaths: [],
};

function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function formatName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadFolders() {
  try {
    const res = await fetch('/api/folders');
    const data = await res.json();
    
    state.customPaths = data.settings.map(path => ({ path, name: null }));
    renderFolders(data.settings, data.config, data.configFileFound);
  } catch (err) {
    console.error('Failed to load folders:', err);
  }
}

function renderFolders(userFolders, configFolders, configFileFound) {
  const userList = document.getElementById('userFoldersList');
  const configList = document.getElementById('configFoldersList');
  const configHint = document.getElementById('configHint');

  userList.innerHTML = userFolders.map(path => `
    <div class="folder-item">
      <div class="folder-info">
        <div class="folder-path">${escapeHtml(path)}</div>
      </div>
      <button class="btn btn-small btn-danger" data-path="${escapeHtml(path)}">Remove</button>
    </div>
  `).join('') || '<p class="hint">No custom folders</p>';

  configList.innerHTML = configFolders.map(folder => `
    <div class="folder-item config">
      <div class="folder-info">
        <div class="folder-path">${escapeHtml(folder.path)}</div>
        ${folder.name ? `<div class="folder-name">${escapeHtml(folder.name)}</div>` : ''}
      </div>
    </div>
  `).join('') || '<p class="hint">No config file found</p>';

  configHint.style.display = configFileFound ? 'none' : 'block';
}

async function loadLaunchers() {
  try {
    const res = await fetch('/api/launchers');
    const settings = await res.json();
    renderLaunchers(settings);
    renderLauncherFolders(settings.folders || {});
  } catch (err) {
    console.error('Failed to load launchers:', err);
  }
}

function renderLaunchers(launchers) {
  const launcherList = document.getElementById('launcherList');
  const launcherNames = [
    { key: 'steam', label: 'Steam' },
    { key: 'epic', label: 'Epic Games' },
    { key: 'gog', label: 'GOG' },
    { key: 'ea', label: 'EA App' },
    { key: 'ubisoft', label: 'Ubisoft Connect' },
    { key: 'xbox', label: 'Xbox' },
    { key: 'battlenet', label: 'Battle.net' },
  ];

  launcherList.innerHTML = launcherNames.map(({ key, label }) => `
    <div class="launcher-item">
      <input type="checkbox" id="launcher-${key}" data-launcher="${key}" ${launchers[key] ? 'checked' : ''}>
      <label for="launcher-${key}">${label}</label>
    </div>
  `).join('');
}

async function toggleLauncher(name, enabled) {
  try {
    await fetch(`/api/launchers/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await loadLaunchers();
  } catch (err) {
    console.error(`Failed to toggle ${name}:`, err);
  }
}

function renderLauncherFolders(folders) {
  const launcherFoldersList = document.getElementById('launcherFoldersList');
  const launcherNames = [
    { key: 'steam', label: 'Steam' },
    { key: 'epic', label: 'Epic Games' },
    { key: 'gog', label: 'GOG' },
    { key: 'ea', label: 'EA App' },
    { key: 'ubisoft', label: 'Ubisoft Connect' },
    { key: 'xbox', label: 'Xbox' },
    { key: 'battlenet', label: 'Battle.net' },
  ];

  launcherFoldersList.innerHTML = launcherNames.map(({ key, label }) => {
    const folder = folders[key] || '';
    return `
      <div class="launcher-folder-item">
        <div class="folder-label">${label}</div>
        <input type="text" 
          class="folder-input" 
          id="folder-${key}"
          data-launcher="${key}" 
          placeholder="Default ${label} folder" 
          value="${escapeHtml(folder)}">
        <button class="btn btn-small btn-browse-folder" data-launcher="${key}" title="Browse folder">📁</button>
        <button class="btn btn-small btn-save-folder" data-launcher="${key}">Save</button>
        ${folder ? `<button class="btn btn-small btn-reset-folder" data-launcher="${key}">Reset</button>` : ''}
      </div>
    `;
  }).join('') || '<p class="hint">Configure launcher folders</p>';
}

async function startScan() {
  const statusEl = document.getElementById('scanStatus');
  const progressEl = document.getElementById('scanProgress');
  const scanBtn = document.getElementById('scanBtn');

  console.log('startScan called');
  statusEl.textContent = 'Scanning...';
  scanBtn.disabled = true;
  
  state.games = [];
  state.filteredGames = [];
  renderTable();

  try {
    const postRes = await fetch('/api/scan', { method: 'POST' });
    const sse = new EventSource('/api/scan');

    sse.addEventListener('started', (event) => {
      console.log('Scan started');
    });

    sse.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data);
        statusEl.textContent = `Scanning: ${data.launcher} (${data.gamesFound} games)`;
      } catch {
        statusEl.textContent = `Scanning: ${event.data}`;
      }
    });

    sse.addEventListener('game', (event) => {
      try {
        const data = JSON.parse(event.data);
        const game = data.game;
        state.games.push(game);
        state.filteredGames = applyFiltersAndSort();
        renderTable();
        updateSummary();
        progressEl.textContent = `Calculating: ${game.name} (${data.current}/${data.total})...`;
      } catch {
        progressEl.textContent = event.data;
      }
    });

    sse.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        const { totalGames, totalSize, durationMs, notes } = data;
        statusEl.textContent = `Complete: ${totalGames} games, ${formatSize(totalSize)}`;
        progressEl.textContent = `Duration: ${Math.round(durationMs / 1000)}s`;
          state.lastScanDuration = durationMs;
        
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(',', '');
        
        const lastScanEl = document.getElementById('lastScanTime');
        if (lastScanEl) {
          lastScanEl.textContent = `Last scan: ${timestamp}`;
        }
        
        scanBtn.disabled = false;
        
        if (notes && notes.length > 0) {
          displayNotes(notes);
        }
        
        sse.close();
        state.sse = null;
      } catch {
        statusEl.textContent = `Complete: ${event.data}`;
      }
    });

    sse.addEventListener('ping', (event) => {
      // Silent keep-alive
    });

    sse.addEventListener('error', (event) => {
      console.log('SSE error event:', { event, data: event.data, currentTarget: event.currentTarget, source: event.currentTarget?.src });
      statusEl.textContent = 'Error occurred';
      scanBtn.disabled = true;
      sse.close();
      console.error('Full error event:', JSON.stringify(event, (key, value) => {
        if (value instanceof Event) return '[Event]';
        if (value instanceof Object && value.src) return '[EventSource]';
        return value;
      }, 2));
    });

    sse.addEventListener('open', () => {
      console.log('SSE connection opened');
    });

    state.sse = sse;
  } catch (err) {
    console.error('Scan error:', err);
    statusEl.textContent = `Error: ${err.message}`;
    scanBtn.disabled = false;
  }
}

function applyFiltersAndSort() {
  let filtered = state.games.filter(game =>
    game.name.toLowerCase().includes(state.filter.toLowerCase())
  );

  filtered.sort((a, b) => {
    let aVal = a[state.sortColumn];
    let bVal = b[state.sortColumn];

    if (state.sortColumn === 'size') {
      aVal = a.size || 0;
      bVal = b.size || 0;
    } else if (state.sortColumn === 'name') {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (state.sortColumn === 'launcher') {
      aVal = a.launcher.toLowerCase();
      bVal = b.launcher.toLowerCase();
    } else if (state.sortColumn === 'rank') {
      aVal = a.size || 0;
      bVal = b.size || 0;
    }

    if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
}

function renderTable() {
  const tbody = document.getElementById('gameTableBody');
  const filterInput = document.getElementById('filterInput');

  tbody.innerHTML = state.filteredGames.map((game, index) => `
    <tr>
      <td class="rank">${index + 1}</td>
      <td class="game-name">${escapeHtml(game.name)}</td>
      <td class="launcher">${escapeHtml(game.launcher)}</td>
      <td class="size">${formatSize(game.size)}</td>
      <td class="path" title="${escapeHtml(game.path)}" data-path="${game.path}">${escapeHtml(game.path)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">No games found. Try adding a custom scan folder.</td></tr>';

  tbody.querySelectorAll('.path').forEach(el => {
    el.addEventListener('click', () => openFolder(el.dataset.path));
  });

  filterInput.value = state.filter;
}

function updateSummary() {
  const totalGames = state.games.length;
  const totalSize = state.games.reduce((sum, g) => sum + (g.size || 0), 0);
  const largest = state.games.sort((a, b) => (b.size || 0) - (a.size || 0))[0];

  document.getElementById('totalGames').textContent = `Total: ${totalGames} games`;
  document.getElementById('totalSize').textContent = `| ${formatSize(totalSize)}`;
  document.getElementById('largestGame').textContent = largest
    ? `| Largest: ${largest.name} (${formatSize(largest.size)})`
    : '| Largest: -';
}

function displayNotes(notes) {
  const container = document.getElementById('warningNotesContainer');
  container.innerHTML = notes.map(note => `
    <div class="warning-note">
      <strong>${escapeHtml(note.launcher)}:</strong> ${escapeHtml(note.message)}
    </div>
  `).join('');
}

async function openFolder(path) {
  try {
    await fetch('/api/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  } catch (err) {
    console.error('Failed to open folder:', err);
  }
}

function toggleSort(column) {
  if (state.sortColumn === column) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortColumn = column;
    state.sortDirection = 'desc';
  }

  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === column) {
      th.classList.add(`sort-${state.sortDirection}`);
    }
  });

  state.filteredGames = applyFiltersAndSort();
  renderTable();
  updateSummary();
}

function toggleManagePanels() {
  const panels = document.getElementById('managePanels');
  const isActive = panels.classList.toggle('active');
  document.getElementById('manageBtn').textContent = isActive ? 'Close Folders' : 'Manage Folders';
}

async function addCustomFolder() {
  const input = document.getElementById('newFolderPath');
  const path = input.value.trim();

  if (!path) return;

  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (res.ok) {
      input.value = '';
      await loadFolders();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add folder');
    }
  } catch (err) {
    alert('Failed to add folder: ' + err.message);
  }
}

async function removeCustomFolder(path) {
  try {
    const res = await fetch('/api/folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (res.ok) {
      await loadFolders();
    }
  } catch (err) {
    console.error('Failed to remove folder:', err);
  }
}

async function saveFolderOverride(launcher, folder) {
  try {
    await fetch(`/api/launchers/${launcher}/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    await loadLaunchers();
  } catch (err) {
    console.error(`Failed to save folder for ${launcher}:`, err);
  }
}

async function browseFolder(launcher) {
  console.log('Browsing folder for:', launcher);
  try {
    const response = await fetch('/api/scan/browse-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launcher }),
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errText}`);
    }
    
    const { folder, error } = await response.json();
    console.log('Response data:', { folder, error });
    
    const input = document.getElementById(`folder-${launcher}`);
    if (input && folder) {
      input.value = folder;
      await saveFolderOverride(launcher, folder);
    } else if (error) {
      console.error('Browse folder error:', error);
    }
  } catch (err) {
    console.error(`Failed to browse folder for ${launcher}:`, err);
    alert('Failed to open folder picker: ' + err.message);
  }
}

async function resetFolderOverride(launcher) {
  try {
    await fetch(`/api/launchers/${launcher}/folder`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    await loadLaunchers();
  } catch (err) {
    console.error(`Failed to reset folder for ${launcher}:`, err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const manageBtn = document.getElementById('manageBtn');
  const managePanels = document.getElementById('managePanels');
  const filterInput = document.getElementById('filterInput');
  const addFolderBtn = document.getElementById('addFolderBtn');
  const newFolderPath = document.getElementById('newFolderPath');
  const launcherList = document.getElementById('launcherList');

  loadFolders();
  loadLaunchers();

  scanBtn.addEventListener('click', startScan);

  manageBtn.addEventListener('click', toggleManagePanels);

  managePanels.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-danger')) {
      const path = e.target.dataset.path;
      if (confirm(`Remove ${path}?`)) {
        await removeCustomFolder(path);
      }
    }
  });

  filterInput.addEventListener('input', (e) => {
    state.filter = e.target.value;
    state.filteredGames = applyFiltersAndSort();
    renderTable();
  });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => toggleSort(th.dataset.sort));
  });

  addFolderBtn.addEventListener('click', addCustomFolder);

  newFolderPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addCustomFolder();
    }
  });

  launcherList.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.dataset.launcher) {
      const name = e.target.dataset.launcher;
      toggleLauncher(name, e.target.checked);
    }
  });

  const launcherFoldersList = document.getElementById('launcherFoldersList');
  if (launcherFoldersList) {
    launcherFoldersList.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-save-folder')) {
        const launcher = e.target.dataset.launcher;
        const input = launcherFoldersList.querySelector(`[data-launcher="${launcher}"]`);
        await saveFolderOverride(launcher, input.value.trim());
      } else if (e.target.classList.contains('btn-reset-folder')) {
        const launcher = e.target.dataset.launcher;
        await resetFolderOverride(launcher);
      } else if (e.target.classList.contains('btn-browse-folder')) {
        const launcher = e.target.dataset.launcher;
        await browseFolder(launcher);
      }
    });

    launcherFoldersList.addEventListener('keypress', (e) => {
      if (e.target.classList.contains('folder-input') && e.key === 'Enter') {
        const launcher = e.target.dataset.launcher;
        e.target.blur();
        saveFolderOverride(launcher, e.target.value.trim());
      }
    });
  }

  const initialPath = window.location.pathname.startsWith('/') 
    ? window.location.pathname.slice(1) 
    : window.location.pathname;
  
  if (initialPath && initialPath.length > 0) {
    newFolderPath.value = initialPath;
  }
});
