/* ============================================
   IndexedDB Manager - Offline Data Storage
   Complete offline storage using IndexedDB
   ============================================ */

const UhasIDB = {
  db: null,
  dbName: 'uhas-toolkit-a',
  dbVersion: 2,
  
  // Initialize IndexedDB
  init: async function () {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        console.error('❌ IndexedDB initialization failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores if they don't exist
        const stores = ['participants', 'interviews', 'audioRecordings', 'surveys', 'toolkit', 'metadata'];
        
        stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('synced', 'synced', { unique: false });
            console.log(`📦 Created object store: ${storeName}`);
          }
        });
      };
    });
  },
  
  // Add or update a single record
  put: async function (storeName, data) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('IndexedDB not initialized'));
      
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put({
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
        synced: data.synced || false
      });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Get a single record by ID
  get: async function (storeName, id) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Get all records from a store
  getAll: async function (storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Query by index
  query: async function (storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Delete a record
  delete: async function (storeName, id) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  // Clear entire store
  clear: async function (storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log(`🗑️ Cleared store: ${storeName}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Get database stats
  getStats: async function () {
    const stores = ['participants', 'interviews', 'audioRecordings', 'surveys', 'toolkit'];
    const stats = {};
    
    for (const store of stores) {
      const items = await this.getAll(store);
      stats[store] = {
        count: items.length,
        synced: items.filter(i => i.synced).length,
        unsynced: items.filter(i => !i.synced).length
      };
    }
    
    return stats;
  },
  
  // Export all data as JSON
  exportAllAsJSON: async function () {
    const stores = ['participants', 'interviews', 'audioRecordings', 'surveys', 'toolkit', 'metadata'];
    const exportData = {
      version: 1,
      exported: new Date().toISOString(),
      app: 'uhas-toolkitA',
      data: {}
    };
    
    for (const store of stores) {
      exportData.data[store] = await this.getAll(store);
    }
    
    return exportData;
  },
  
  // Import data from JSON
  importFromJSON: async function (jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      let imported = 0;
      let errors = 0;
      
      for (const [storeName, records] of Object.entries(data.data || {})) {
        if (Array.isArray(records)) {
          for (const record of records) {
            try {
              await this.put(storeName, record);
              imported++;
            } catch (e) {
              console.warn(`Failed to import record from ${storeName}:`, e);
              errors++;
            }
          }
        }
      }
      
      return { imported, errors, success: errors === 0 };
    } catch (e) {
      console.error('Import failed:', e);
      throw e;
    }
  },
  
  // Mark records as synced
  markSynced: async function (storeName, ids) {
    const synced = [];
    for (const id of ids) {
      const record = await this.get(storeName, id);
      if (record) {
        record.synced = true;
        record.syncedAt = new Date().toISOString();
        await this.put(storeName, record);
        synced.push(id);
      }
    }
    return synced;
  },
  
  // Get unsynced records
  getUnsynced: async function (storeName) {
    return this.query(storeName, 'synced', false);
  },
  
  // Batch operation
  batch: async function (operations) {
    const results = [];
    
    for (const op of operations) {
      try {
        let result;
        switch (op.type) {
          case 'put':
            result = await this.put(op.store, op.data);
            break;
          case 'get':
            result = await this.get(op.store, op.id);
            break;
          case 'delete':
            result = await this.delete(op.store, op.id);
            break;
          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }
        results.push({ success: true, result });
      } catch (e) {
        results.push({ success: false, error: e.message });
      }
    }
    
    return results;
  }
};

// Make available globally
window.UhasIDB = UhasIDB;
