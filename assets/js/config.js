/* ============================================
   UHAS-HPI Unified Configuration
   Single config for all modules
   ============================================ */

const CONFIG = {
  // App Info
  app: {
    name: 'UHAS-HPI Hypertension Study',
    shortName: 'UHAS-HPI',
    version: '1.0.0',
    description: 'Personalized Hypertension Management Research Platform'
  },

  // Firebase Configuration (uhas-study project)
  firebase: {
    apiKey: "AIzaSyCAv32vE8dduCOstrZiuFUHHdiz3pQYMXs",
    authDomain: "uhas-study.firebaseapp.com",
    projectId: "uhas-study",
    storageBucket: "uhas-study.firebasestorage.app",
    messagingSenderId: "952946475862",
    appId: "1:952946475862:web:70f90e3e7f96407c728cf7"
  },

  // IndexedDB Configuration
  db: {
    name: 'uhas-hpi-db',
    version: 1,
    stores: {
      participants: 'participants',
      surveys: 'surveys',
      toolkit: 'toolkit',
      sync: 'sync'
    }
  },

  // Participant ID Prefixes (matching Toolkit A system)
  participantPrefixes: {
    patient: 'PAT',
    clinician: 'CLN',
    herbalist: 'HRB',
    caregiver: 'CG',
    policymaker: 'POL',
    researcher: 'RES'
  },

  // Storage paths
  storage: {
    surveys: 'surveys',
    toolkit: 'toolkit-data',
    exports: 'exports'
  }
};

// Make available globally
window.CONFIG = CONFIG;
