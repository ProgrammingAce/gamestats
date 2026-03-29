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

const LAUNCHER_NAMES = [
  { key: 'steam', label: 'Steam' },
  { key: 'epic', label: 'Epic Games' },
  { key: 'gog', label: 'GOG' },
  { key: 'ea', label: 'EA App' },
  { key: 'ubisoft', label: 'Ubisoft Connect' },
  { key: 'xbox', label: 'Xbox' },
  { key: 'battlenet', label: 'Battle.net' },
];

function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 1) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
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

async function loadLastScanResults() {
  try {
    const res = await fetch('/api/scan/last-results');
    const data = await res.json();
    
    if (data) {
      state.games = data.games || [];
      state.filteredGames = applyFiltersAndSort();
      renderTable();
      updateSummary();
      
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
      
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to load last scan results:', err);
    return false;
  }
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
  const userList = document.querySelector('#userFoldersList');
  const configList = document.querySelector('#configFoldersList');
  const configHint = document.querySelector('#configHint');

  if (!userList) return;

  const userFoldersHTML = userFolders.map(path => `
    <div class="folder-item">
      <div class="folder-info">
        <div class="folder-path">${escapeHtml(path)}</div>
      </div>
      <button class="btn btn-small btn-danger" data-path="${escapeHtml(path)}">Remove</button>
    </div>
  `).join('') || '<p class="hint">No custom folders</p>';

  const configFoldersHTML = configFolders.map(folder => `
    <div class="folder-item config">
      <div class="folder-info">
        <div class="folder-path">${escapeHtml(folder.path)}</div>
        ${folder.name ? `<div class="folder-name">${escapeHtml(folder.name)}</div>` : ''}
      </div>
    </div>
  `).join('') || '<p class="hint">No config file found</p>';

  userList.innerHTML = userFoldersHTML;
  configList.innerHTML = configFoldersHTML;

  if (configHint) {
    configHint.style.display = configFileFound ? 'none' : 'block';
  }
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
  const launcherList = document.querySelector('#launcherList');

  if (!launcherList) return;

  launcherList.innerHTML = LAUNCHER_NAMES.map(({ key, label }) => `
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
  const launcherFoldersList = document.querySelector('#launcherFoldersList');

  if (!launcherFoldersList) return;

  launcherFoldersList.innerHTML = LAUNCHER_NAMES.map(({ key, label }) => {
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
   const progressText = document.getElementById('progressText');
   const scanBtn = document.getElementById('scanBtn');

  statusEl.textContent = 'Scanning...';
  scanBtn.disabled = true;
  
  state.games = [];
  state.filteredGames = [];
  const tbody = document.getElementById('gameTableBody');
  tbody.innerHTML = '';

  if (state.sse) {
    state.sse.close();
  }

  try {
    const postRes = await fetch('/api/scan', { method: 'POST' });
    const sse = new EventSource('/api/scan');

    sse.addEventListener('started', (event) => {});

    sse.addEventListener('progress', (event) => {
      try {
        let data = JSON.parse(event.data);
        if (data.data) data = data.data;
        if (data.launcher) statusEl.textContent = `Scanning: ${data.launcher} (${data.gamesFound} games)`;
        else statusEl.textContent = `Scanning: ${event.data}`;
      } catch (err) {
        console.error('Progress parse error:', err, event.data);
        statusEl.textContent = `Scanning: ${event.data}`;
      }
    });

sse.addEventListener('game', (event) => {
      try {
        let data = JSON.parse(event.data);
        if (data.data) data = data.data;
        if (data.game) {
          state.games.push(data.game);
          state.filteredGames = applyFiltersAndSort();
          renderTable();
          updateSummary();
          const percentage = Math.round((data.current / data.total) * 100);
          progressEl.value = percentage;
          progressText.textContent = `${percentage}%`;
          progressEl.textContent = `${data.game.name}`;
        }
      } catch (err) {
        console.error('Game event error:', err, event.data);
          progressEl.textContent = event.data;
          progressText.textContent = 'Error';
      }
    });

    sse.addEventListener('complete', (event) => {
      try {
        let data = JSON.parse(event.data);
        if (data.data) {
          data = data.data;
        }
        const { totalGames, totalSize, durationMs, notes } = data;
        statusEl.textContent = `Complete: ${totalGames} games, ${formatSize(totalSize)}`;
          progressEl.value = 100;
          progressText.textContent = `Duration: ${Math.round(durationMs / 1000)}s`;
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
      statusEl.textContent = 'Error occurred';
      scanBtn.disabled = false;
      sse.close();
    });

    sse.addEventListener('open', () => {});

    sse.addEventListener('message', (event) => {});

    state.sse = sse;
  } catch (err) {
    console.error('Scan error:', err);
    statusEl.textContent = `Error: ${err.message}`;
    scanBtn.disabled = false;
  }
}

function applyFiltersAndSort() {
  let filtered = state.games.filter(game => {
    const filterLower = state.filter.toLowerCase();
    const launcherMatch = filterLower.startsWith('launcher:') || filterLower.startsWith('l:');
    
    if (launcherMatch) {
      const launcherFilter = filterLower.slice(launcherMatch ? 'launcher:'.length : 'l:'.length);
      return game.launcher.toLowerCase().includes(launcherFilter);
    }
    
    return game.name.toLowerCase().includes(state.filter.toLowerCase());
  });

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

  if (state.filteredGames.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Scanning...</td></tr>';
  } else {
    tbody.innerHTML = state.filteredGames.map((game, index) => {
      const displayName = game.launcher === 'Custom' ? formatName(game.name) : game.name;
      return `
      <tr>
        <td class="rank">${index + 1}</td>
        <td class="game-name">${escapeHtml(displayName)}</td>
        <td class="launcher">${escapeHtml(game.launcher)}</td>
        <td class="size">${formatSize(game.size)}</td>
        <td class="path" title="${escapeHtml(game.path)}" data-path="${escapeHtml(game.path)}">${escapeHtml(game.path)}</td>
      </tr>
    `;
    }).join('');
  }

  tbody.querySelectorAll('.path').forEach(el => {
    el.addEventListener('click', () => openFolder(el.dataset.path));
  });

  filterInput.value = state.filter;
}

function updateSummary() {
  const totalGames = state.games.length;
  const totalSize = state.games.reduce((sum, g) => sum + (g.size || 0), 0);
  const largest = [...state.games].sort((a, b) => (b.size || 0) - (a.size || 0))[0];

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

async function addCustomFolder(path) {
  if (!path) return;

  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (res.ok) {
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
  try {
    const response = await fetch('/api/scan/browse-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launcher }),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errText}`);
    }
    
    const { folder, error } = await response.json();
    
    const input = document.getElementById(`folder-${launcher}`);
    if (input && folder) {
      input.value = folder;
      await saveFolderOverride(launcher, folder);
    } else if (error) {
      console.error('Browse folder error:', error);
    }
  } catch (err) {
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

document.addEventListener('DOMContentLoaded', async () => {
  const scanBtn = document.getElementById('scanBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', startScan);
  }
  
  const hasLastResults = await loadLastScanResults();
  if (!hasLastResults) {
    startScan();
  }

  const manageBtn = document.getElementById('manageBtn');
  if (manageBtn) {
    manageBtn.addEventListener('click', showFoldersPage);
  }

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const format = prompt('Export as (csv or json)?', 'csv');
      if (format && (format === 'csv' || format === 'json')) {
        exportGames(format.toLowerCase());
      }
    });
  }

  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      state.filter = e.target.value;
      state.filteredGames = applyFiltersAndSort();
      renderTable();
    });
  }

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => toggleSort(th.dataset.sort));
  });

  document.querySelectorAll('#userFoldersList').forEach(userList => {
    userList.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-danger')) {
        const path = e.target.dataset.path;
        await removeCustomFolder(path);
        loadFolders();
      }
    });
  });

  document.querySelectorAll('#addFolderBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newFolderPath = document.getElementById('newFolderPath');
      if (newFolderPath) {
        const path = newFolderPath.value.trim();
        if (path) {
          await addCustomFolder(path);
          newFolderPath.value = '';
          loadFolders();
        }
      }
    });
  });

  document.querySelectorAll('#newFolderPath').forEach(input => {
    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const path = input.value.trim();
        if (path) {
          await addCustomFolder(path);
          input.value = '';
          loadFolders();
        }
      }
    });
  });

  document.querySelectorAll('#launcherList').forEach(list => {
    list.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox' && e.target.dataset.launcher) {
        const name = e.target.dataset.launcher;
        toggleLauncher(name, e.target.checked);
      }
    });
  });

  document.querySelectorAll('#launcherFoldersList').forEach(list => {
    list.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-save-folder')) {
        const launcher = e.target.dataset.launcher;
        const input = list.querySelector(`[data-launcher="${launcher}"]`);
        if (input) {
          await saveFolderOverride(launcher, input.value.trim());
        }
      } else if (e.target.classList.contains('btn-reset-folder')) {
        const launcher = e.target.dataset.launcher;
        await resetFolderOverride(launcher);
      } else if (e.target.classList.contains('btn-browse-folder')) {
        const launcher = e.target.dataset.launcher;
        await browseFolder(launcher);
      }
    });

    list.addEventListener('keypress', (e) => {
      if (e.target.classList.contains('folder-input') && e.key === 'Enter') {
        const launcher = e.target.dataset.launcher;
        e.target.blur();
        saveFolderOverride(launcher, e.target.value.trim());
      }
    });
  });
});

function showFoldersPage() {
  document.getElementById('homePage').style.display = 'none';
  document.getElementById('foldersPage').style.display = 'flex';
  loadFolders();
  loadLaunchers();
}

function showHomePage() {
  document.getElementById('foldersPage').style.display = 'none';
  document.getElementById('homePage').style.display = 'block';
}

async function exportGames(format) {
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting...';
  }

  try {
    let content, filename, mimeType;

    if (format === 'csv') {
      const headers = ['Rank', 'Name', 'Launcher', 'Size (bytes)', 'Path'];
      const rows = state.filteredGames.map((game, index) => [
        index + 1,
        `"${game.name.replace(/"/g, '""')}"`,
        game.launcher,
        game.size,
        `"${game.path.replace(/"/g, '""')}"`
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      filename = 'games_export.csv';
      mimeType = 'text/csv';
    } else {
      const exportData = state.filteredGames.map((game, index) => ({
        rank: index + 1,
        name: game.name,
        launcher: game.launcher,
        size: game.size,
        path: game.path
      }));
      content = JSON.stringify(exportData, null, 2);
      filename = 'games_export.json';
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to export: ' + err.message);
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export';
    }
  }
}

const backToHomeBtn = document.getElementById('backToHomeBtn');
if (backToHomeBtn) {
  backToHomeBtn.addEventListener('click', showHomePage);
}
