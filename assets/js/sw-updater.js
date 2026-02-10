/* ============================================
   Service Worker Auto-Updater
   Automatically detects and applies SW updates
   ============================================ */

(function() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  // Listen for controller change (new SW took over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    console.log('[SW Updater] New service worker activated, reloading...');
    window.location.reload();
  });

  // Listen for messages from SW
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      console.log('[SW Updater] App updated to:', event.data.version);
      showUpdateToast();
    }
  });

  // Register SW and check for updates
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('[SW Updater] SW registered');

      // Check for updates immediately
      registration.update();

      // Check for updates periodically (every 5 minutes)
      setInterval(() => {
        registration.update();
        console.log('[SW Updater] Checking for updates...');
      }, 5 * 60 * 1000);

      // Handle waiting SW (update ready but not activated)
      if (registration.waiting) {
        promptUpdate(registration.waiting);
      }

      // Handle new SW installing
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[SW Updater] New version installing...');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed, prompt user or auto-update
            promptUpdate(newWorker);
          }
        });
      });

    } catch (err) {
      console.warn('[SW Updater] Registration failed:', err);
    }
  });

  // Prompt for update (auto-applies after short delay)
  function promptUpdate(worker) {
    console.log('[SW Updater] Update available!');
    
    // Show toast notification
    showUpdateToast();

    // Auto-apply update after 2 seconds
    setTimeout(() => {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }, 2000);
  }

  // Show update notification toast
  function showUpdateToast() {
    // Remove existing toast if any
    const existing = document.getElementById('swUpdateToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'swUpdateToast';
    toast.innerHTML = `
      <style>
        #swUpdateToast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #0c8778, #0a6e63);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          z-index: 99999;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: slideUp 0.3s ease-out;
        }
        #swUpdateToast .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="spinner"></div>
      <span>Updating app...</span>
    `;
    document.body.appendChild(toast);

    // Remove after reload (fallback cleanup)
    setTimeout(() => toast.remove(), 5000);
  }
})();
