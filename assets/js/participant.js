/* ============================================
   UHAS-HPI Participant ID System
   Unified ID generation for all modules
   Matches Toolkit A system
   ============================================ */

const PARTICIPANT_TYPES = {
  patient: {
    prefix: 'PAT',
    label: 'Patient',
    icon: 'bi-person-heart'
  },
  clinician: {
    prefix: 'CLN',
    label: 'Clinician',
    icon: 'bi-hospital'
  },
  herbalist: {
    prefix: 'HRB',
    label: 'Herbalist',
    icon: 'bi-flower2'
  },
  caregiver: {
    prefix: 'CG',
    label: 'Caregiver',
    icon: 'bi-people'
  },
  policymaker: {
    prefix: 'POL',
    label: 'Policymaker',
    icon: 'bi-building'
  },
  researcher: {
    prefix: 'RES',
    label: 'Researcher',
    icon: 'bi-mortarboard'
  }
};

class ParticipantManager {
  constructor() {
    this.counters = {};
  }

  /**
   * Generate a new participant ID
   * Format: PREFIX-XXXXXX (e.g., PAT-000001)
   */
  generateId(type) {
    const config = PARTICIPANT_TYPES[type];
    if (!config) {
      console.warn(`Unknown participant type: ${type}, using RES`);
      return this.generateId('researcher');
    }

    // Get or initialize counter for this type
    const counterKey = `participant_counter_${type}`;
    let counter = parseInt(localStorage.getItem(counterKey) || '0', 10);
    counter++;
    localStorage.setItem(counterKey, counter.toString());

    // Format: PREFIX-XXXXXX
    const id = `${config.prefix}-${String(counter).padStart(6, '0')}`;
    return id;
  }

  /**
   * Parse a participant ID to get type and number
   */
  parseId(participantId) {
    const match = participantId.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return null;

    const [, prefix, number] = match;
    const type = Object.entries(PARTICIPANT_TYPES).find(([, config]) => config.prefix === prefix);
    
    return {
      prefix,
      number: parseInt(number, 10),
      type: type ? type[0] : null,
      label: type ? type[1].label : 'Unknown'
    };
  }

  /**
   * Validate a participant ID format
   */
  isValidId(participantId) {
    return /^[A-Z]{2,3}-\d{6}$/.test(participantId);
  }

  /**
   * Get type info
   */
  getType(type) {
    return PARTICIPANT_TYPES[type] || null;
  }

  /**
   * Get all types
   */
  getAllTypes() {
    return PARTICIPANT_TYPES;
  }

  /**
   * Get type from prefix
   */
  getTypeFromPrefix(prefix) {
    const entry = Object.entries(PARTICIPANT_TYPES).find(([, config]) => config.prefix === prefix);
    return entry ? entry[0] : null;
  }

  /**
   * Create participant record
   */
  async createParticipant(type, metadata = {}) {
    const participantId = this.generateId(type);
    const config = PARTICIPANT_TYPES[type];

    const participant = {
      participantId,
      type,
      label: config.label,
      prefix: config.prefix,
      metadata,
      createdAt: new Date().toISOString()
    };

    // Save to database if available
    if (window.db && window.db.db) {
      await window.db.addParticipant(participant);
    }

    return participant;
  }

  /**
   * Lookup participant by ID
   */
  async getParticipant(participantId) {
    if (window.db && window.db.db) {
      return window.db.getParticipant(participantId);
    }
    return null;
  }

  /**
   * Get all participants by type
   */
  async getParticipantsByType(type) {
    if (window.db && window.db.db) {
      return window.db.getParticipantsByType(type);
    }
    return [];
  }

  /**
   * Get current counter for a type
   */
  getCounter(type) {
    const counterKey = `participant_counter_${type}`;
    return parseInt(localStorage.getItem(counterKey) || '0', 10);
  }

  /**
   * Reset counter for a type (use with caution)
   */
  resetCounter(type) {
    const counterKey = `participant_counter_${type}`;
    localStorage.removeItem(counterKey);
  }
}

// Create singleton instance
const participantManager = new ParticipantManager();

// Make available globally
window.participantManager = participantManager;
window.PARTICIPANT_TYPES = PARTICIPANT_TYPES;
