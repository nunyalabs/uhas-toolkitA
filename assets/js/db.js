/* ============================================
   UHAS-HPI Unified Database
   Single IndexedDB for all modules
   ============================================ */

class UnifiedDB {
  constructor() {
    this.db = null;
    this.dbName = 'uhas-hpi-db';
    this.dbVersion = 2;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Database initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Participants store
        if (!db.objectStoreNames.contains('participants')) {
          const participantStore = db.createObjectStore('participants', {
            keyPath: 'id',
            autoIncrement: true
          });
          participantStore.createIndex('participantId', 'participantId', { unique: true });
          participantStore.createIndex('type', 'type', { unique: false });
          participantStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Surveys store
        if (!db.objectStoreNames.contains('surveys')) {
          const surveyStore = db.createObjectStore('surveys', {
            keyPath: 'id',
            autoIncrement: true
          });
          surveyStore.createIndex('participantId', 'participantId', { unique: false });
          surveyStore.createIndex('type', 'type', { unique: false });
          surveyStore.createIndex('synced', 'synced', { unique: false });
          surveyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Toolkit data store
        if (!db.objectStoreNames.contains('toolkit')) {
          const toolkitStore = db.createObjectStore('toolkit', {
            keyPath: 'id',
            autoIncrement: true
          });
          toolkitStore.createIndex('participantId', 'participantId', { unique: false });
          toolkitStore.createIndex('module', 'module', { unique: false });
          toolkitStore.createIndex('synced', 'synced', { unique: false });
          toolkitStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', {
            keyPath: 'id',
            autoIncrement: true
          });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  // ===== GENERIC CRUD OPERATIONS =====

  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      const record = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        synced: false
      };

      const request = store.add(record);
      request.onsuccess = () => {
        record.id = request.result;
        resolve(record);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async upsert(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      const record = {
        ...data,
        updatedAt: new Date().toISOString(),
        synced: false // Mark as unsynced on update so it gets pushed to Firebase
      };

      // put() works as an upsert (insert or update)
      const request = store.put(record);
      request.onsuccess = () => {
        // If the key was auto-generated, it's in request.result
        if (!record.id) record.id = request.result;
        resolve(record);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async update(storeName, id, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error('Record not found'));
          return;
        }

        const updated = {
          ...existing,
          ...data,
          id,
          updatedAt: new Date().toISOString()
        };

        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== SPECIFIC HELPERS =====

  async getUnsynced(storeName) {
    // Get all records and filter for unsynced (boolean values can't be used as IndexedDB keys)
    const all = await this.getAll(storeName);
    return all.filter(item => !item.synced);
  }

  async markSynced(storeName, id) {
    return this.update(storeName, id, { synced: true, syncedAt: new Date().toISOString() });
  }

  // ===== PARTICIPANT HELPERS =====

  async addParticipant(data) {
    return this.add('participants', data);
  }

  async getParticipant(participantId) {
    const results = await this.getByIndex('participants', 'participantId', participantId);
    return results[0] || null;
  }

  async getParticipantsByType(type) {
    return this.getByIndex('participants', 'type', type);
  }

  // ===== SURVEY HELPERS =====

  async addSurvey(data) {
    return this.add('surveys', data);
  }

  async getSurveysByParticipant(participantId) {
    return this.getByIndex('surveys', 'participantId', participantId);
  }

  async getUnsyncedSurveys() {
    return this.getUnsynced('surveys');
  }

  // ===== TOOLKIT HELPERS =====

  async addToolkitData(module, participantId, data) {
    return this.add('toolkit', {
      module,
      participantId,
      data
    });
  }

  async getToolkitDataByParticipant(participantId) {
    return this.getByIndex('toolkit', 'participantId', participantId);
  }

  async getToolkitDataByModule(module) {
    return this.getByIndex('toolkit', 'module', module);
  }

  // ===== EXPORT =====

  async exportAll() {
    const participants = await this.getAll('participants');
    const surveys = await this.getAll('surveys');
    const toolkit = await this.getAll('toolkit');

    return {
      exportedAt: new Date().toISOString(),
      participants,
      surveys,
      toolkit
    };
  }

  async exportAsJSON() {
    const data = await this.exportAll();
    return JSON.stringify(data, null, 2);
  }
}

// Create singleton instance
const db = new UnifiedDB();

// Make available globally
window.db = db;
