/* ============================================
   Import/Export Manager
   Handle JSON and CSV import/export operations
   ============================================ */

const ImportExportManager = {
  
  // Export data as JSON
  exportJSON: async function (type = 'all') {
    let data = {};
    let filename = '';
    
    try {
      switch (type) {
        case 'all':
          data = await UhasIDB.exportAllAsJSON();
          filename = `uhas-toolkitA-full-${Date.now()}.json`;
          break;
          
        case 'participants':
          const participants = await UhasIDB.getAll('participants');
          data = {
            version: 1,
            exported: new Date().toISOString(),
            app: 'uhas-toolkitA',
            type: 'participants',
            data: participants
          };
          filename = `uhas-participants-${Date.now()}.json`;
          break;
          
        case 'interviews':
          const interviews = await UhasIDB.getAll('interviews');
          data = {
            version: 1,
            exported: new Date().toISOString(),
            app: 'uhas-toolkitA',
            type: 'interviews',
            data: interviews
          };
          filename = `uhas-interviews-${Date.now()}.json`;
          break;
          
        case 'audioRecordings':
          const recordings = await UhasIDB.getAll('audioRecordings');
          data = {
            version: 1,
            exported: new Date().toISOString(),
            app: 'uhas-toolkitA',
            type: 'audioRecordings',
            data: recordings
          };
          filename = `uhas-audio-metadata-${Date.now()}.json`;
          break;
          
        default:
          throw new Error(`Unknown export type: ${type}`);
      }
      
      this._downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
      console.log(`✅ JSON export successful: ${filename}`);
      return { success: true, filename };
      
    } catch (error) {
      console.error('❌ JSON export failed:', error);
      throw error;
    }
  },
  
  // Export data as CSV
  exportCSV: async function (type = 'participants') {
    let csv = '';
    let filename = '';
    
    try {
      switch (type) {
        case 'participants':
          csv = await this._generateParticipantsCSV();
          filename = `uhas-participants-${Date.now()}.csv`;
          break;
          
        case 'interviews':
          csv = await this._generateInterviewsCSV();
          filename = `uhas-interviews-${Date.now()}.csv`;
          break;
          
        case 'audioRecordings':
          csv = await this._generateAudioRecordingsCSV();
          filename = `uhas-audio-recordings-${Date.now()}.csv`;
          break;
          
        default:
          throw new Error(`Unknown export type: ${type}`);
      }
      
      this._downloadFile(csv, filename, 'text/csv');
      console.log(`✅ CSV export successful: ${filename}`);
      return { success: true, filename };
      
    } catch (error) {
      console.error('❌ CSV export failed:', error);
      throw error;
    }
  },
  
  // Generate Participants CSV
  _generateParticipantsCSV: async function () {
    const participants = await UhasIDB.getAll('participants');
    const headers = ['ID', 'Name', 'Type', 'Gender', 'Age', 'Eligible', 'Site', 'Status', 'Date Created', 'Last Modified'];
    
    const rows = participants.map(p => [
      p.id || '',
      this._escapeCSV(p.name || ''),
      p.type || '',
      p.gender || '',
      p.age || '',
      p.isEligible ? 'Yes' : 'No',
      p.site || '',
      p.status || 'Active',
      p.timestamp || '',
      p.lastModified || ''
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(',')).join('\n');
  },
  
  // Generate Interviews CSV
  _generateInterviewsCSV: async function () {
    const interviews = await UhasIDB.getAll('interviews');
    const headers = ['ID', 'Participant ID', 'Mode', 'Duration', 'Status', 'Notes', 'Date', 'Synced'];
    
    const rows = interviews.map(i => [
      i.id || '',
      i.participantId || '',
      i.mode || '',
      i.duration || '',
      i.status || '',
      this._escapeCSV(i.notes || ''),
      i.timestamp || '',
      i.synced ? 'Yes' : 'No'
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(',')).join('\n');
  },
  
  // Generate Audio Recordings CSV
  _generateAudioRecordingsCSV: async function () {
    const recordings = await UhasIDB.getAll('audioRecordings');
    const headers = ['ID', 'Participant ID', 'Duration', 'Format', 'File Size', 'Date Recorded', 'Synced'];
    
    const rows = recordings.map(r => [
      r.id || '',
      r.participantId || '',
      r.duration || '',
      r.format || 'webm',
      r.fileSize || 0,
      r.timestamp || '',
      r.synced ? 'Yes' : 'No'
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(',')).join('\n');
  },
  
  // Import JSON file
  importJSON: async function (file) {
    try {
      const text = await this._readFile(file);
      const data = JSON.parse(text);
      
      // Validate structure
      if (!data.data) {
        throw new Error('Invalid JSON format: missing "data" field');
      }
      
      const result = await UhasIDB.importFromJSON(data);
      console.log(`✅ JSON import successful: ${result.imported} records imported, ${result.errors} errors`);
      return result;
      
    } catch (error) {
      console.error('❌ JSON import failed:', error);
      throw error;
    }
  },
  
  // Import CSV file
  importCSV: async function (file, storeType) {
    try {
      const text = await this._readFile(file);
      const rows = this._parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row');
      }
      
      const headers = rows[0];
      const data = rows.slice(1).map(row => this._rowToObject(headers, row));
      
      // Determine store based on file content or parameter
      let storeName = storeType || this._guessStoreType(headers);
      
      // Import records
      let imported = 0;
      let errors = 0;
      
      for (const record of data) {
        try {
          record.id = record.id || `${Date.now()}-${Math.random()}`;
          record.timestamp = record.timestamp || new Date().toISOString();
          record.synced = false;
          
          await UhasIDB.put(storeName, record);
          imported++;
        } catch (e) {
          console.warn(`Failed to import row:`, record, e);
          errors++;
        }
      }
      
      console.log(`✅ CSV import successful: ${imported} records imported to ${storeName}, ${errors} errors`);
      return { imported, errors, success: errors === 0, storeName };
      
    } catch (error) {
      console.error('❌ CSV import failed:', error);
      throw error;
    }
  },
  
  // Parse CSV text
  _parseCSV: function (text) {
    const rows = [];
    let current = [];
    let insideQuotes = false;
    let cell = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          cell += '"';
          i++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        current.push(cell.trim());
        cell = '';
      } else if ((char === '\n' || char === '\r') && !insideQuotes) {
        if (cell || current.length > 0) {
          current.push(cell.trim());
          if (current.some(c => c)) { // Skip empty rows
            rows.push(current);
          }
          current = [];
          cell = '';
          if (char === '\r' && nextChar === '\n') {
            i++; // Skip \n in \r\n
          }
        }
      } else {
        cell += char;
      }
    }
    
    if (cell || current.length > 0) {
      current.push(cell.trim());
      if (current.some(c => c)) {
        rows.push(current);
      }
    }
    
    return rows;
  },
  
  // Convert CSV row to object
  _rowToObject: function (headers, row) {
    const obj = {};
    headers.forEach((header, index) => {
      const key = header.toLowerCase().replace(/\s+/g, '');
      obj[key] = row[index] || '';
    });
    return obj;
  },
  
  // Guess store type from CSV headers
  _guessStoreType: function (headers) {
    const headerText = headers.join(',').toLowerCase();
    
    if (headerText.includes('participant') && headerText.includes('interview')) {
      return 'interviews';
    }
    if (headerText.includes('audio') || headerText.includes('duration') || headerText.includes('webm')) {
      return 'audioRecordings';
    }
    if (headerText.includes('gender') || headerText.includes('eligible') || headerText.includes('site')) {
      return 'participants';
    }
    
    return 'toolkit'; // Default
  },
  
  // Escape CSV cell content
  _escapeCSV: function (text) {
    if (typeof text !== 'string') return String(text);
    return text.replace(/"/g, '""');
  },
  
  // Read file as text
  _readFile: function (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  },
  
  // Download file
  _downloadFile: function (content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  
  // Create file input element for import
  createImportInput: function (callback, accept = '.json,.csv') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        
        let result;
        if (file.name.endsWith('.json')) {
          result = await this.importJSON(file);
        } else if (file.name.endsWith('.csv')) {
          result = await this.importCSV(file);
        }
        
        if (callback) callback(result);
      } catch (error) {
        console.error('Import error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    };
    
    return input;
  }
};

// Make available globally
window.ImportExportManager = ImportExportManager;
