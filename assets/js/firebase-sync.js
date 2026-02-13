/* ============================================
   Firebase Sync Module - UHAS Toolkit A
   Auto-sync data & audio to Firestore
   Collections: toolkita/data, toolkita/audio
   ============================================ */

const FirebaseSync = {
  db: null,
  storage: null,
  app: null,
  isInitialized: false,
  isSyncing: false,
  syncInterval: null,
  AUTO_SYNC_MS: 20000,

  // Config loaded from firebase-config.js (git-ignored)
  config: window.FIREBASE_CONFIG || null,

  /*
   * ============================================
   * FIRESTORE RULES (deploy in Firebase Console → Firestore → Rules)
   * ============================================
   * rules_version = '2';
   * service cloud.firestore {
   *   match /databases/{database}/documents {
   *     match /toolkita/{document=**} {
   *       allow read, write: if true;
   *     }
   *   }
   * }
   *
   * ============================================
   * STORAGE RULES (deploy in Firebase Console → Storage → Rules)
   * ============================================
   * rules_version = '2';
   * service firebase.storage {
   *   match /b/{bucket}/o {
   *     match /toolkita/{allPaths=**} {
   *       allow read, write: if true;
   *     }
   *   }
   * }
   * ============================================
   */

  init: async function () {
    try {
      if (!this.config) {
        console.warn('Firebase config not found – create firebase-config.js (see README)');
        return false;
      }

      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded');
        return false;
      }

      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(this.config);
      } else {
        this.app = firebase.apps[0];
      }

      this.db = firebase.firestore();
      this.storage = firebase.storage();

      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
      } catch (err) {
        // OK - persistence may already be enabled or unsupported
      }

      this.isInitialized = true;
      console.log('✅ Firebase connected');

      this.startAutoSync();

      window.addEventListener('online', () => {
        this._updateSyncUI('syncing');
        setTimeout(() => this.syncAll(), 1500);
      });

      window.addEventListener('offline', () => {
        this._updateSyncUI('idle');
      });

      if (navigator.onLine) {
        setTimeout(() => this.syncAll(), 3000);
      }

      return true;
    } catch (error) {
      console.error('Firebase init failed:', error);
      return false;
    }
  },

  startAutoSync: function () {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) this.syncAll();
    }, this.AUTO_SYNC_MS);
  },

  syncAll: async function () {
    if (!this.isInitialized || this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    this._updateSyncUI('syncing');

    try {
      const results = {
        participants: await this.syncStore('participants'),
        interviews: await this.syncStore('interviews'),
        audioMeta: await this.syncStore('audioRecordings'),
        audioBlobs: await this.syncAudioBlobs()
      };

      const totalSynced = results.participants.synced + results.interviews.synced +
        results.audioMeta.synced + results.audioBlobs.synced;

      if (totalSynced > 0) {
        this._updateSyncUI('success', totalSynced);
      } else {
        this._updateSyncUI('uptodate');
      }
      return results;
    } catch (error) {
      console.error('Sync failed:', error);
      this._updateSyncUI('error');
      return null;
    } finally {
      this.isSyncing = false;
    }
  },

  syncStore: async function (storeName) {
    const result = { synced: 0, errors: 0 };
    try {
      if (typeof UhasIDB === 'undefined' || !UhasIDB.db) return result;

      const allRecords = await UhasIDB.getAll(storeName);
      const unsynced = allRecords.filter(r => !r.synced);
      if (unsynced.length === 0) return result;

      const collectionRef = this.db.collection('toolkita').doc('data').collection(storeName);

      for (const record of unsynced) {
        try {
          const docId = String(record.id).replace(/[\/\.#\[\]]/g, '_');
          const cleanRecord = this._cleanForFirestore(record);
          cleanRecord._syncedAt = firebase.firestore.FieldValue.serverTimestamp();
          cleanRecord._deviceId = this._getDeviceId();

          await collectionRef.doc(docId).set(cleanRecord, { merge: true });

          record.synced = true;
          record.syncedAt = new Date().toISOString();
          await UhasIDB.put(storeName, record);
          result.synced++;
        } catch (err) {
          console.error(`[FirebaseSync] Failed to sync ${storeName}/${record.id}:`, err.code || err.message);
          if (err.code === 'permission-denied') {
            console.error('[FirebaseSync] ⚠️ PERMISSION DENIED - Deploy Firestore rules in Firebase Console!');
            if (typeof App !== 'undefined') App.Toast('⚠️ Firebase rules not deployed! Check console.');
          }
          result.errors++;
        }
      }
    } catch (error) {
      console.error(`[FirebaseSync] syncStore(${storeName}) failed:`, error.code || error.message);
      result.errors++;
    }
    return result;
  },

  syncAudioBlobs: async function () {
    const result = { synced: 0, errors: 0 };
    try {
      if (typeof App === 'undefined' || !App.AudioDB || !App.AudioDB.db) return result;

      const allBlobs = await App.AudioDB.getAllBlobs();
      const unsynced = allBlobs.filter(r => !r.synced);
      if (unsynced.length === 0) return result;

      for (const record of unsynced) {
        try {
          const blob = record.blob;
          if (!blob) continue;
          const uploaded = await this._uploadBlob(record.id, blob, record.metadata, record.createdAt);
          if (uploaded) {
            await App.AudioDB.markSynced(record.id);
            result.synced++;
          }
        } catch (err) {
          console.error(`[FirebaseSync] Audio upload failed for ${record.id}:`, err.code || err.message);
          if (err.code === 'storage/unauthorized') {
            console.error('[FirebaseSync] ⚠️ STORAGE UNAUTHORIZED - Deploy Storage rules in Firebase Console!');
            if (typeof App !== 'undefined') App.Toast('⚠️ Firebase Storage rules not deployed!');
          }
          result.errors++;
        }
      }
    } catch (error) {
      console.error('[FirebaseSync] syncAudioBlobs failed:', error.code || error.message);
      result.errors++;
    }
    return result;
  },

  // Upload a single audio blob to Firebase Storage + Firestore metadata
  _uploadBlob: async function (id, blob, metadata, createdAt) {
    const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    const storagePath = `toolkita/audio/${safeId}.${ext}`;

    const storageRef = this.storage.ref(storagePath);
    const uploadResult = await storageRef.put(blob, {
      contentType: blob.type || 'audio/webm',
      customMetadata: {
        recordId: String(id),
        participantId: metadata?.participantId || '',
        mode: metadata?.mode || '',
        deviceId: this._getDeviceId()
      }
    });

    const downloadURL = await uploadResult.ref.getDownloadURL();

    await this.db.collection('toolkita').doc('audio').collection('files').doc(safeId).set({
      id, downloadURL, storagePath,
      contentType: blob.type || 'audio/webm',
      size: blob.size,
      sizeKB: Math.round(blob.size / 1024),
      metadata: metadata || {},
      createdAt: createdAt || new Date().toISOString(),
      _syncedAt: firebase.firestore.FieldValue.serverTimestamp(),
      _deviceId: this._getDeviceId()
    }, { merge: true });

    console.log(`✅ Audio uploaded: ${safeId} (${(blob.size / 1024).toFixed(0)} KB)`);
    return true;
  },

  // Called right after recording stops - immediate upload
  uploadSingleAudio: async function (id, blob, metadata) {
    if (!this.isInitialized || !navigator.onLine) return false;
    try {
      const success = await this._uploadBlob(id, blob, metadata, new Date().toISOString());
      if (success && typeof App !== 'undefined' && App.AudioDB) {
        await App.AudioDB.markSynced(id);
      }
      return success;
    } catch (err) {
      console.warn('Immediate audio upload queued for later:', err.message);
      return false;
    }
  },

  // Called right after saving a data record
  uploadSingleRecord: async function (storeName, record) {
    if (!this.isInitialized || !navigator.onLine) return false;
    try {
      const docId = String(record.id).replace(/[\/\.#\[\]]/g, '_');
      const collectionRef = this.db.collection('toolkita').doc('data').collection(storeName);

      const cleanRecord = this._cleanForFirestore(record);
      cleanRecord._syncedAt = firebase.firestore.FieldValue.serverTimestamp();
      cleanRecord._deviceId = this._getDeviceId();

      await collectionRef.doc(docId).set(cleanRecord, { merge: true });

      if (typeof UhasIDB !== 'undefined' && UhasIDB.db) {
        record.synced = true;
        record.syncedAt = new Date().toISOString();
        await UhasIDB.put(storeName, record);
      }
      console.log(`✅ Record synced: ${storeName}/${record.id}`);
      return true;
    } catch (err) {
      console.error(`[FirebaseSync] uploadSingleRecord failed:`, err.code || err.message);
      if (err.code === 'permission-denied' && typeof App !== 'undefined') {
        App.Toast('⚠️ Firebase rules not deployed! Check Firebase Console.');
      }
      return false;
    }
  },

  // Reset all synced flags so records retry upload (use after deploying rules)
  resetSyncFlags: async function () {
    let reset = 0;
    try {
      if (typeof UhasIDB !== 'undefined' && UhasIDB.db) {
        for (const store of ['participants', 'interviews', 'audioRecordings']) {
          const all = await UhasIDB.getAll(store);
          for (const r of all) {
            if (r.synced) {
              r.synced = false;
              delete r.syncedAt;
              await UhasIDB.put(store, r);
              reset++;
            }
          }
        }
      }
      if (typeof App !== 'undefined' && App.AudioDB && App.AudioDB.db) {
        const blobs = await App.AudioDB.getAllBlobs();
        for (const b of blobs) {
          if (b.synced) {
            b.synced = false;
            delete b.syncedAt;
            const tx = App.AudioDB.db.transaction('audioBlobs', 'readwrite');
            tx.objectStore('audioBlobs').put(b);
            reset++;
          }
        }
      }
      console.log(`✅ Reset ${reset} sync flags — will retry on next sync`);
      if (typeof App !== 'undefined') App.Toast(`Reset ${reset} records — syncing now...`);
      // Trigger immediate sync
      setTimeout(() => this.syncAll(), 500);
    } catch (err) {
      console.error('Reset sync flags failed:', err);
    }
    return reset;
  },

  manualSync: async function () {
    if (!this.isInitialized) {
      if (typeof App !== 'undefined') App.Toast('Firebase not ready');
      return;
    }
    if (this.isSyncing) {
      if (typeof App !== 'undefined') App.Toast('Sync in progress...');
      return;
    }
    if (!navigator.onLine) {
      if (typeof App !== 'undefined') App.Toast('Offline - will sync when connected');
      return;
    }

    const results = await this.syncAll();
    if (results && typeof App !== 'undefined') {
      const total = results.participants.synced + results.interviews.synced +
        results.audioMeta.synced + results.audioBlobs.synced;
      App.Toast(total > 0 ? `✅ ${total} items synced to cloud` : '✅ All up to date');
    }
  },

  getSyncStatus: async function () {
    const status = {
      participants: { total: 0, synced: 0, pending: 0 },
      interviews: { total: 0, synced: 0, pending: 0 },
      audioRecordings: { total: 0, synced: 0, pending: 0 },
      audioBlobs: { total: 0, synced: 0, pending: 0 }
    };

    try {
      if (typeof UhasIDB !== 'undefined' && UhasIDB.db) {
        for (const store of ['participants', 'interviews', 'audioRecordings']) {
          const all = await UhasIDB.getAll(store);
          status[store].total = all.length;
          status[store].synced = all.filter(r => r.synced).length;
          status[store].pending = all.filter(r => !r.synced).length;
        }
      }
      if (typeof App !== 'undefined' && App.AudioDB && App.AudioDB.db) {
        const blobs = await App.AudioDB.getAllBlobs();
        status.audioBlobs.total = blobs.length;
        status.audioBlobs.synced = blobs.filter(r => r.synced).length;
        status.audioBlobs.pending = blobs.filter(r => !r.synced).length;
      }
    } catch (err) { /* ignore */ }
    return status;
  },

  _cleanForFirestore: function (record) {
    const clean = {};
    for (const [key, value] of Object.entries(record)) {
      if (value instanceof Blob || value instanceof ArrayBuffer || value instanceof File) continue;
      if (value === undefined) { clean[key] = null; continue; }
      if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
        clean[key] = this._cleanForFirestore(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  },

  _getDeviceId: function () {
    let id = localStorage.getItem('uhas_device_id');
    if (!id) {
      id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      localStorage.setItem('uhas_device_id', id);
    }
    return id;
  },

  _updateSyncUI: function (status, detail) {
    const el = document.getElementById('firebaseSyncStatus');
    if (!el) return;

    switch (status) {
      case 'syncing':
        el.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Syncing';
        el.className = 'firebase-sync-badge syncing';
        break;
      case 'success':
        el.innerHTML = `<i class="bi bi-cloud-check-fill"></i> ${detail} synced`;
        el.className = 'firebase-sync-badge success';
        setTimeout(() => this._updateSyncUI('idle'), 4000);
        break;
      case 'uptodate':
        el.innerHTML = '<i class="bi bi-cloud-check-fill"></i> Synced';
        el.className = 'firebase-sync-badge success';
        setTimeout(() => this._updateSyncUI('idle'), 4000);
        break;
      case 'error':
        el.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Error';
        el.className = 'firebase-sync-badge error';
        setTimeout(() => this._updateSyncUI('idle'), 6000);
        break;
      default:
        el.innerHTML = navigator.onLine
          ? '<i class="bi bi-cloud-check"></i> Cloud'
          : '<i class="bi bi-cloud-slash"></i> Offline';
        el.className = 'firebase-sync-badge ' + (navigator.onLine ? 'idle' : 'error');
        break;
    }
  },

  showSyncDetails: async function () {
    const status = await this.getSyncStatus();
    const totalPending = status.participants.pending + status.interviews.pending +
      status.audioRecordings.pending + status.audioBlobs.pending;

    const modal = document.getElementById('firebaseSyncModal');
    if (!modal) return;

    const rows = [
      { key: 'participants', icon: 'people', label: 'Participants' },
      { key: 'interviews', icon: 'chat-dots', label: 'Interviews' },
      { key: 'audioRecordings', icon: 'mic', label: 'Audio Meta' },
      { key: 'audioBlobs', icon: 'file-music', label: 'Audio Files' }
    ];

    document.getElementById('syncDetailContent').innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>Firebase:</span>
          <span style="color:${this.isInitialized ? 'var(--success)' : 'var(--danger)'};font-weight:600">
            ${this.isInitialized ? '● Connected' : '● Disconnected'}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Network:</span>
          <span style="color:${navigator.onLine ? 'var(--success)' : 'var(--danger)'};font-weight:600">
            ${navigator.onLine ? '● Online' : '● Offline'}
          </span>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:10px 0">
      <table style="width:100%;font-size:0.85rem;border-collapse:collapse;">
        <tr style="border-bottom:1px solid var(--border);">
          <th style="padding:6px 4px;text-align:left;">Store</th>
          <th style="padding:6px;text-align:center;">Total</th>
          <th style="padding:6px;text-align:center;">✓</th>
          <th style="padding:6px;text-align:center;">⏳</th>
        </tr>
        ${rows.map(r => {
      const s = status[r.key];
      return `<tr>
            <td style="padding:5px 4px"><i class="bi bi-${r.icon}"></i> ${r.label}</td>
            <td style="text-align:center">${s.total}</td>
            <td style="text-align:center;color:var(--success)">${s.synced}</td>
            <td style="text-align:center;color:${s.pending ? 'var(--warning)' : 'var(--text-secondary)'};font-weight:${s.pending ? '600' : '400'}">${s.pending}</td>
          </tr>`;
    }).join('')}
      </table>
      <hr style="border:none;border-top:1px solid var(--border);margin:10px 0">
      <div style="display:flex;justify-content:space-between;font-weight:600;margin-bottom:14px;">
        <span>Pending:</span>
        <span style="color:${totalPending ? 'var(--warning)' : 'var(--success)'}">${totalPending}</span>
      </div>
      <button class="btn btn-primary" onclick="FirebaseSync.manualSync();document.getElementById('firebaseSyncModal').style.display='none';"
              ${!navigator.onLine ? 'disabled' : ''} style="width:100%;padding:14px;font-size:1.05rem;font-weight:600;border-radius:12px;">
        <i class="bi bi-cloud-upload"></i> Sync Now
      </button>
      <button class="btn btn-outline" onclick="FirebaseSync.resetSyncFlags();document.getElementById('firebaseSyncModal').style.display='none';"
              style="width:100%;padding:12px;font-size:0.95rem;font-weight:600;border-radius:12px;margin-top:8px;">
        <i class="bi bi-arrow-counterclockwise"></i> Reset & Retry All
      </button>
      <p style="font-size:0.7rem;color:var(--text-secondary);margin-top:10px;text-align:center;">
        Auto-syncs every ${this.AUTO_SYNC_MS / 1000}s when online
      </p>
      <div style="margin-top:12px;padding:10px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);font-size:0.75rem;color:var(--text-secondary);">
        <strong style="color:var(--warning);">\u26a0\ufe0f If sync fails:</strong> Deploy rules in Firebase Console:<br>
        <strong>Firestore</strong> \u2192 Rules \u2192 paste from <code>firestore.rules</code><br>
        <strong>Storage</strong> \u2192 Rules \u2192 paste from <code>storage.rules</code>
      </div>
    `;
    modal.style.display = 'flex';
  }
};

window.FirebaseSync = FirebaseSync;
