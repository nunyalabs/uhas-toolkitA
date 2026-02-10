// Firebase configuration for UHAS Study
const firebaseConfig = {
  apiKey: "AIzaSyCAv32vE8dduCOstrZiuFUHHdiz3pQYMXs",
  authDomain: "uhas-study.firebaseapp.com",
  projectId: "uhas-study",
  storageBucket: "uhas-study.firebasestorage.app",
  messagingSenderId: "952946475862",
  appId: "1:952946475862:web:70f90e3e7f96407c728cf7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Auth instance
const auth = firebase.auth();

// Firestore instance (use firestoreDb to avoid conflict with IndexedDB db)
const firestoreDb = firebase.firestore();

// Enable offline persistence with new cache API (no more warnings)
try {
  // Offline persistence is now configured in Firestore settings
  // No need to call enablePersistence() separately
} catch (err) {
  console.warn('Firestore initialization:', err);
}

// Storage instance
const storage = firebase.storage();
