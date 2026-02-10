/* ============================================
   UHAS-HPI Firebase Sync Service
   Unified sync for surveys and toolkit data
   ============================================ */

class SyncService {
  constructor() {
    this.storage = null;
    this.isOnline = navigator.onLine;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateStatusUI();
      console.log('📶 Back online - attempting auto-sync...');

      // Auto-sync when connection is restored
      setTimeout(() => {
        this.syncAll().then(result => {
          console.log('🔄 Auto-sync complete:', result);
          // Optional: Show a toast or small notification
        }).catch(err => {
          console.warn('⚠️ Auto-sync failed:', err);
        });
      }, 3000); // Small delay to ensure connection is stable
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusUI();
      console.log('📴 Gone offline');
    });
  }

  updateStatusUI() {
    const statusElements = document.querySelectorAll('[data-sync-status]');
    statusElements.forEach(el => {
      if (this.isOnline) {
        el.classList.remove('status-offline');
        el.classList.add('status-online');
        el.innerHTML = '<span class="status-dot"></span> Online';
      } else {
        el.classList.remove('status-online');
        el.classList.add('status-offline');
        el.innerHTML = '<span class="status-dot"></span> Offline';
      }
    });
  }

  /**
   * Initialize Firebase
   */
  async initFirebase() {
    if (!window.firebase) {
      console.warn('Firebase SDK not loaded');
      return false;
    }

    if (!window.CONFIG?.firebase) {
      console.warn('Firebase config not found');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.CONFIG.firebase);
      }
      this.storage = firebase.storage();
      this.firestore = firebase.firestore();
      this.auth = firebase.auth();
      console.log('✅ Firebase initialized (Storage + Firestore)');
      return true;
    } catch (error) {
      console.error('Firebase init error:', error);
      return false;
    }
  }

  /**
   * Ensure user is authenticated for storage uploads
   * Auto-signs in anonymously for surveys (no user action needed)
   */
  async ensureAuth() {
    if (!this.auth) {
      await this.initFirebase();
    }

    // Check if already signed in
    if (this.auth.currentUser) {
      console.log('✅ Already authenticated:', this.auth.currentUser.uid);
      return true;
    }

    // Auto sign-in anonymously for survey uploads (no prompt)
    try {
      const result = await this.auth.signInAnonymously();
      console.log('✅ Auto-signed in anonymously:', result.user.uid);
      return true;
    } catch (error) {
      console.error('❌ Anonymous auth failed:', error);
      // Don't fail - surveys can still be saved locally
      return false;
    }
  }

  /**
   * Upload data to Firebase Storage as JSON blob
   */
  async uploadToStorage(path, data) {
    if (!this.storage) {
      const initialized = await this.initFirebase();
      if (!initialized) throw new Error('Firebase not initialized');
    }

    // Ensure authenticated before upload
    const authed = await this.ensureAuth();
    if (!authed) throw new Error('Authentication required for sync');

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    const ref = this.storage.ref(path);
    const snapshot = await ref.put(blob, {
      contentType: 'application/json',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        participantId: data.participantId || 'unknown'
      }
    });

    const downloadUrl = await snapshot.ref.getDownloadURL();
    console.log(`✅ Uploaded: ${path}`);

    return {
      path,
      downloadUrl,
      size: blob.size
    };
  }

  /**
   * Sync a survey response to Firestore
   * Automatically uses anonymous auth if needed
   */
  async syncSurvey(surveyRecord) {
    if (!this.firestore) {
      const initialized = await this.initFirebase();
      if (!initialized) {
        console.warn('⚠️ Firebase not initialized, skipping cloud sync');
        throw new Error('Firebase not initialized');
      }
    }

    // Ensure authenticated (auto-signs in anonymously)
    const authed = await this.ensureAuth();
    if (!authed) {
      console.warn('⚠️ Could not authenticate, skipping cloud sync (data is still saved locally)');
      throw new Error('Authentication failed');
    }

    try {
      // Save to Firestore surveys collection
      const docRef = await this.firestore.collection('surveys').add({
        participantId: surveyRecord.participantId,
        type: surveyRecord.type,
        studySite: surveyRecord.studySite,
        data: surveyRecord.data,
        createdAt: surveyRecord.createdAt || new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        localId: surveyRecord.id,
        userId: this.auth.currentUser?.uid || 'anonymous'
      });

      console.log(`✅ Synced survey to Firestore: ${docRef.id}`);

      return {
        firestoreId: docRef.id,
        collection: 'surveys',
        participantId: surveyRecord.participantId
      };
    } catch (error) {
      console.error('❌ Error syncing survey to Firestore:', error);
      throw error;
    }
  }

  /**
   * Sync toolkit data to Firestore
   */
  async syncToolkitData(toolkitRecord) {
    if (!this.firestore) {
      const initialized = await this.initFirebase();
      if (!initialized) throw new Error('Firebase not initialized');
    }

    // Ensure authenticated
    const authed = await this.ensureAuth();
    if (!authed) throw new Error('Authentication required for sync');

    try {
      // Determine collection based on module
      const collectionMap = {
        'toolkit-a': 'toolkit-a-participants',
        'toolkit-b': 'toolkit-b-codesign',
        'toolkit-c': 'toolkit-c-trials',
        'toolkit-d': 'toolkit-d-policy',
        'toolkit-e': 'toolkit-e-economic'
      };

      const collection = collectionMap[toolkitRecord.module] || 'toolkit-data';

      // Save to Firestore
      const docRef = await this.firestore.collection(collection).add({
        participantId: toolkitRecord.participantId,
        module: toolkitRecord.module,
        data: toolkitRecord.data,
        createdAt: toolkitRecord.createdAt || new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        localId: toolkitRecord.id
      });

      console.log(`✅ Synced toolkit data to Firestore: ${docRef.id}`);

      return {
        firestoreId: docRef.id,
        collection: collection,
        participantId: toolkitRecord.participantId
      };
    } catch (error) {
      console.error('Error syncing toolkit data to Firestore:', error);
      throw error;
    }
  }

  /**
   * Sync all unsynced surveys
   */
  async syncAllSurveys() {
    if (!window.db || !window.db.db) {
      throw new Error('Database not initialized');
    }

    const unsynced = await window.db.getUnsyncedSurveys();

    if (unsynced.length === 0) {
      return { synced: 0, failed: 0, message: 'All surveys already synced' };
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const record of unsynced) {
      try {
        await this.syncSurvey(record);
        await window.db.markSynced('surveys', record.id);
        synced++;
      } catch (error) {
        failed++;
        errors.push({ id: record.id, error: error.message });
        console.error(`Sync failed for survey ${record.id}:`, error);
      }
    }

    return { synced, failed, errors };
  }

  /**
   * Sync all unsynced toolkit data
   */
  async syncAllToolkit() {
    if (!window.db || !window.db.db) {
      throw new Error('Database not initialized');
    }

    const unsynced = await window.db.getUnsynced('toolkit');

    if (unsynced.length === 0) {
      return { synced: 0, failed: 0, message: 'All toolkit data already synced' };
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const record of unsynced) {
      try {
        await this.syncToolkitData(record);
        await window.db.markSynced('toolkit', record.id);
        synced++;
      } catch (error) {
        failed++;
        errors.push({ id: record.id, error: error.message });
        console.error(`Sync failed for toolkit ${record.id}:`, error);
      }
    }

    return { synced, failed, errors };
  }

  /**
   * Sync everything
   */
  async syncAll() {
    const surveyResult = await this.syncAllSurveys();
    const toolkitResult = await this.syncAllToolkit();

    return {
      surveys: surveyResult,
      toolkit: toolkitResult,
      totalSynced: surveyResult.synced + toolkitResult.synced,
      totalFailed: surveyResult.failed + toolkitResult.failed
    };
  }

  /**
   * Export all data as JSON file download
   */
  async exportData() {
    if (!window.db || !window.db.db) {
      throw new Error('Database not initialized');
    }

    const data = await window.db.exportAll();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uhas-hpi-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename: a.download };
  }
}

// Create singleton instance
const syncService = new SyncService();

// Make available globally
window.syncService = syncService;
