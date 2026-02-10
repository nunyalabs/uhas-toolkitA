// Auth guard for protected pages
// Include this script after firebase-config.js and auth.js

(function () {
  // Show loading overlay while checking auth
  const overlay = document.createElement('div');
  overlay.id = 'authOverlay';
  overlay.innerHTML = `
    <style>
      #authOverlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg, #f4f6f8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        flex-direction: column;
        gap: 16px;
      }
      #authOverlay .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(12, 135, 120, 0.2);
        border-top-color: #0c8778;
        border-radius: 50%;
        animation: authSpin 0.8s linear infinite;
      }
      @keyframes authSpin {
        to { transform: rotate(360deg); }
      }
      #authOverlay p {
        color: #6b7280;
        font-family: 'Inter', sans-serif;
      }
    </style>
    <div class="spinner"></div>
    <p>Verifying access...</p>
  `;
  document.body.appendChild(overlay);

  // Check auth state
  Auth.init((user) => {
    if (user) {
      // User is logged in, remove overlay and show page
      overlay.remove();

      // Add user info to header if header exists
      const headerNav = document.querySelector('.header-nav');
      if (headerNav) {
        // Check if user menu already exists
        if (!document.getElementById('userMenu')) {
          const userMenu = document.createElement('div');
          userMenu.id = 'userMenu';
          userMenu.className = 'user-menu';
          userMenu.innerHTML = `
            <style>
              .user-menu {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: 8px;
                padding-left: 8px;
                border-left: 1px solid var(--border, #e5e7eb);
              }
              .user-menu .user-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: var(--primary, #0c8778);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 14px;
              }
              .user-menu .user-name {
                font-size: 14px;
                color: var(--text, #1f2937);
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .user-menu .btn-logout {
                padding: 6px 12px;
                font-size: 12px;
                background: transparent;
                border: 1px solid var(--border, #e5e7eb);
                border-radius: 4px;
                color: var(--text-secondary, #6b7280);
                cursor: pointer;
                transition: all 0.2s;
              }
              .user-menu .btn-logout:hover {
                background: var(--danger, #dc3545);
                border-color: var(--danger, #dc3545);
                color: white;
              }
              @media (max-width: 640px) {
                .user-menu .user-name { display: none; }
              }
            </style>
            <div class="user-avatar">${user.email.charAt(0).toUpperCase()}</div>
            <span class="user-name">${user.email.split('@')[0]}</span>
            <button class="btn-logout" onclick="handleLogout()">
              <i class="bi bi-box-arrow-right"></i> Logout
            </button>
          `;
          headerNav.appendChild(userMenu);
        }
      }
    } else {
      // User is not logged in, sign in anonymously
      const overlayText = document.querySelector('#authOverlay p');
      if (overlayText) overlayText.textContent = "Signing in anonymously...";

      firebase.auth().signInAnonymously().catch((error) => {
        console.error("Anonymous auth failed:", error);
        // Fallback to login if anonymous fails
        const currentPath = window.location.pathname;
        window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
      });
    }
  });

  // Logout handler
  window.handleLogout = async function () {
    const result = await Auth.signOut();
    if (result.success) {
      window.location.href = '/login.html';
    }
  };
})();
