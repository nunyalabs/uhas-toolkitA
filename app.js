/* ============================================
   UHAS Toolkit A - Complete Offline Research Tool
   IndexedDB storage for offline capability
   ============================================ */

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize IndexedDB for complete offline storage
    await UhasIDB.init();
    console.log('✅ IndexedDB initialized - Complete offline mode');

    // Update dashboard stats
    await updateDashboard();

    // Setup Data Manager tabs
    setupDataManagerTabs();

    console.log('✅ UHAS Toolkit A ready for offline use');
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
});

// ===== DASHBOARD STATS =====
async function updateDashboard() {
  try {
    // Get counts from IndexedDB
    const participants = await UhasIDB.getAll('participants');
    const interviews = await UhasIDB.getAll('interviews');
    const audioRecordings = await UhasIDB.getAll('audioRecordings');

    // Total participants
    const totalEl = document.getElementById('totalParticipants');
    if (totalEl) totalEl.textContent = participants.length;

    // Completed interviews
    const completedEl = document.getElementById('completedInterviews');
    if (completedEl) {
      const completed = interviews.filter(i => i.status === 'completed').length;
      completedEl.textContent = completed;
    }

    // Unsynced records (all data is stored locally, show total unexported)
    const unsyncedEl = document.getElementById('syncedCount');
    if (unsyncedEl) {
      const unexported = audioRecordings.filter(a => !a.exported).length;
      unsyncedEl.textContent = unexported;
    }
  } catch (error) {
    console.error('Dashboard update failed:', error);
  }
}

// ===== DATA MANAGER TABS =====
function setupDataManagerTabs() {
  document.querySelectorAll('[data-dm-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('[data-dm-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding content
      document.querySelectorAll('.dm-tab-content').forEach(c => c.style.display = 'none');
      const target = document.getElementById('dm-' + tab.dataset.dmTab);
      if (target) target.style.display = 'block';

      // Load audio files when audio tab is selected
      if (tab.dataset.dmTab === 'audio') {
        DataManager.loadAudioFiles();
      }
    });
  });
}

// ===== DATA MANAGER MODAL =====
function openDataManager() {
  document.getElementById('dataManagerModal').style.display = 'flex';
  DataManager.updateStats();
}

function closeDataManager() {
  document.getElementById('dataManagerModal').style.display = 'none';
}

// ===== DATA MANAGER OBJECT =====
const DataManager = {
  // Update stats in modal
  updateStats: async () => {
    try {
      // Get data from IndexedDB (all offline)
      const participants = await UhasIDB.getAll('participants');
      const interviews = await UhasIDB.getAll('interviews');
      const audioRecordings = await UhasIDB.getAll('audioRecordings');

      // Update counts
      document.getElementById('dmParticipants').textContent = participants.length;
      document.getElementById('dmInterviews').textContent = interviews.length;
      document.getElementById('dmAudioFiles').textContent = audioRecordings.length;

      // Count unexported items
      const unexported = audioRecordings.filter(r => !r.exported).length;
      document.getElementById('dmUnsynced').textContent = unexported;
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  },

  // Backup all data to local storage
  backupAll: async () => {
    const statusEl = document.getElementById('syncStatus');
    statusEl.innerHTML = '<p><i class="bi bi-hourglass-split"></i> Creating backup...</p>';

    try {
      const result = await ImportExportManager.exportJSON('all');
      statusEl.innerHTML = `<p style="color: var(--success);">✅ Backup created successfully!</p>
        <div style="font-size: 0.9rem; margin-top: 8px; word-break: break-word;">
          <div>File: ${result.filename}</div>
          <div style="color: var(--text-secondary); margin-top: 4px;">All data backed up locally</div>
        </div>`;
      
      console.log('✅ Backup complete:', result);
      DataManager.updateStats();
    } catch (error) {
      console.error('❌ Backup failed:', error);
      statusEl.innerHTML = `<p style="color: var(--danger);">❌ Backup failed: ${error.message}</p>`;
    }
  },

  // Export specific module data
  exportModule: async (module) => {
    const statusEl = document.getElementById('syncStatus');
    statusEl.innerHTML = `<p><i class="bi bi-hourglass-split"></i> Exporting ${module}...</p>`;

    try {
      let result;
      switch (module) {
        case 'participants':
          result = await ImportExportManager.exportJSON('participants');
          break;
        case 'interviews':
          result = await ImportExportManager.exportJSON('interviews');
          break;
        case 'audioRecordings':
          result = await ImportExportManager.exportJSON('audioRecordings');
          break;
        default:
          throw new Error(`Unknown module: ${module}`);
      }

      statusEl.innerHTML = `<p style="color: var(--success);">✅ ${module} exported successfully!</p>
        <div style="font-size: 0.9rem; margin-top: 8px; word-break: break-word;">
          <div>File: ${result.filename}</div>
        </div>`;

      DataManager.updateStats();
    } catch (error) {
      statusEl.innerHTML = `<p style="color: var(--danger);">❌ Export failed: ${error.message}</p>`;
    }
  },

  // Export JSON
  exportJSON: async (type) => {
    try {
      await ImportExportManager.exportJSON(type === 'all' ? 'all' : type);
      DataManager.updateStats();
    } catch (error) {
      console.error('Export failed:', error);
      alert('❌ Export failed: ' + error.message);
    }
  },

  // Export CSV
  exportCSV: async (type) => {
    try {
      await ImportExportManager.exportCSV(type);
      DataManager.updateStats();
    } catch (error) {
      console.error('Export failed:', error);
      alert('❌ Export failed: ' + error.message);
    }
  },

  // Load audio file metadata
  loadAudioFiles: async () => {
    const container = document.getElementById('audioFilesList');
    container.innerHTML = '<p class="text-muted text-center p-3"><i class="bi bi-hourglass-split"></i> Loading...</p>';

    try {
      const audioRecordings = await UhasIDB.getAll('audioRecordings');

      if (audioRecordings.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-3">No audio recordings found.</p>';
        return;
      }

      container.innerHTML = audioRecordings.map(r => `
        <div class="audio-item">
          <div>
            <strong>${r.participantId || 'Unknown'}</strong>
            <br><small class="text-muted">${r.timestamp ? new Date(r.timestamp).toLocaleString() : 'Unknown date'}</small>
            ${r.exported ? '<br><span class="badge" style="background: var(--success); color: white; font-size: 0.6rem;">Exported</span>' : ''}
          </div>
          <button class="btn btn-outline btn-sm" onclick="DataManager.exportAudio('${r.id}')">
            <i class="bi bi-download"></i>
          </button>
        </div>
      `).join('');
    } catch (error) {
      console.error('Failed to load audio files:', error);
      container.innerHTML = '<p class="text-muted text-center p-3">Failed to load audio files.</p>';
    }
  },

  // Export audio metadata as file
  exportAudio: async (id) => {
    try {
      const record = await UhasIDB.get('audioRecordings', id);
      if (!record) {
        alert('Recording not found.');
        return;
      }

      const json = JSON.stringify(record, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio_${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert('✅ Audio metadata exported!');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export audio metadata.');
    }
  },

  // Clear module data
  clearModule: (module) => {
    if (!confirm(`Are you sure you want to delete all ${module} data? This cannot be undone.`)) return;

    const storeMap = {
      'participants': 'participants',
      'interviews': 'interviews',
      'audioRecordings': 'audioRecordings'
    };

    const storeName = storeMap[module];
    if (storeName && window.UhasIDB) {
      UhasIDB.clear(storeName);
      DataManager.updateStats();
      alert(`✅ ${module} data cleared.`);
    }
  },

  // Clear all data
  clearAll: () => {
    if (!confirm('Are you sure you want to delete ALL toolkit data? This cannot be undone.')) return;
    if (!confirm('This is your last chance. Really delete everything?')) return;

    // Clear all IndexedDB stores
    const stores = ['participants', 'interviews', 'audioRecordings', 'surveys', 'toolkit', 'metadata'];
    stores.forEach(store => {
      if (window.UhasIDB) {
        UhasIDB.clear(store);
      }
    });

    DataManager.updateStats();
    updateDashboard();
    alert('✅ All data cleared from device storage.');
  },

  // Import data
  importData: () => {
    const input = ImportExportManager.createImportInput((result) => {
      if (result.success) {
        alert(`✅ Import successful! ${result.imported} records imported.`);
        DataManager.updateStats();
        updateDashboard();
      } else {
        alert(`❌ Import failed: ${result.error || 'Unknown error'}`);
      }
    });
    input.click();
  },

  // Export data as JSON
  exportAllJSON: () => {
    ImportExportManager.exportJSON('all').catch(error => {
      alert('❌ Export failed: ' + error.message);
    });
  },

  // Export data as CSV
  exportAllCSV: () => {
    ImportExportManager.exportCSV('participants').catch(error => {
      alert('❌ Export failed: ' + error.message);
    });
  }
};

// Make functions available globally
window.openDataManager = openDataManager;
window.closeDataManager = closeDataManager;
window.DataManager = DataManager;
window.backupAll = DataManager.backupAll;
window.exportAllJSON = DataManager.exportAllJSON;
window.exportAllCSV = DataManager.exportAllCSV;
window.importData = DataManager.importData;
