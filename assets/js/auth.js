// Authentication module for UHAS Study
const Auth = {
  // Current user
  user: null,
  
  // User roles
  ROLES: {
    ADMIN: 'admin',
    COORDINATOR: 'coordinator', 
    RESEARCHER: 'researcher',
    FIELD_WORKER: 'field_worker'
  },

  // Initialize auth state listener
  init: (onAuthChange) => {
    auth.onAuthStateChanged((user) => {
      Auth.user = user;
      if (onAuthChange) onAuthChange(user);
    });
  },

  // Check if user is logged in
  isAuthenticated: () => {
    return Auth.user !== null;
  },

  // Get current user
  getCurrentUser: () => {
    return Auth.user;
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: Auth.getErrorMessage(error.code) };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await auth.signOut();
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  },

  // Send password reset email
  resetPassword: async (email) => {
    try {
      await auth.sendPasswordResetEmail(email);
      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: Auth.getErrorMessage(error.code) };
    }
  },

  // Get user profile from Firestore
  getUserProfile: async (uid) => {
    try {
      const doc = await firestoreDb.collection('users').doc(uid).get();
      if (doc.exists) {
        return { success: true, profile: doc.data() };
      }
      return { success: false, error: 'Profile not found' };
    } catch (error) {
      console.error('Get profile error:', error);
      return { success: false, error: error.message };
    }
  },

  // Check if user has required role
  hasRole: async (requiredRole) => {
    if (!Auth.user) return false;
    const profile = await Auth.getUserProfile(Auth.user.uid);
    if (!profile.success) return false;
    
    const userRole = profile.profile.role;
    const roleHierarchy = ['field_worker', 'researcher', 'coordinator', 'admin'];
    const userLevel = roleHierarchy.indexOf(userRole);
    const requiredLevel = roleHierarchy.indexOf(requiredRole);
    
    return userLevel >= requiredLevel;
  },

  // Require authentication - redirect if not logged in
  requireAuth: (redirectUrl = '/login.html') => {
    if (!Auth.user) {
      const currentPath = window.location.pathname;
      window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(currentPath)}`;
      return false;
    }
    return true;
  },

  // Get friendly error messages
  getErrorMessage: (code) => {
    const messages = {
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'Email already registered',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/invalid-credential': 'Invalid email or password'
    };
    return messages[code] || 'An error occurred. Please try again.';
  }
};

// Export for use in other modules
window.Auth = Auth;
