// ── Auth ──────────────────────────────────────────────────────────────────────
// Username + Password login. JWT stored in localStorage via api.js.

async function initApp() {
    const urlParams  = new URLSearchParams(window.location.search);
    const stateParam = urlParams.get('state');

    // Debug-/Testmodus — ?debug überspringt Login & Server komplett (js/debug.js)
    if (urlParams.has('debug')) { initDebugMode(stateParam); return; }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Legacy URL mode — ?state= keeps working as before
    if (stateParam) {
        isLegacyUrlMode = true;
        let decoded = null;
        try { decoded = LZString.decompressFromEncodedURIComponent(stateParam); } catch (_) {}
        if (!decoded) { try { decoded = atob(stateParam); } catch (_) {} }
        if (decoded) {
            try { gameState = JSON.parse(decoded); bootGame(); return; } catch (_) {}
        }
        renderNameInputs();
        setupScreen.style.display = 'flex';
        return;
    }

    // Check saved JWT
    const token = api.getToken();
    if (!token) {
        const lobby = urlParams.get('lobby');
        const game  = urlParams.get('game');
        if (lobby) sessionStorage.setItem('da_pending_lobby', lobby);
        if (game)  sessionStorage.setItem('da_pending_game',  game);
        showLoginScreen();
        return;
    }

    // Verify token with server
    try {
        currentProfile = await api.get('/api/auth/me');
        await afterLogin();
    } catch {
        api.clearToken();
        showLoginScreen();
    }
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('home-screen').style.display  = 'none';
}

async function handleLogin() {
    const username = document.getElementById('login-username-input').value.trim();
    const password = document.getElementById('login-password-input').value;

    if (!username) { showToast('Ingame-Name eingeben.'); return; }
    if (!password || password.length < 4) { showToast('Passwort mindestens 4 Zeichen.'); return; }

    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Bitte warten...';

    try {
        const data = await api.post('/api/auth/login', { username, password });
        api.setToken(data.token);
        currentProfile = data.profile;
        document.getElementById('login-screen').style.display = 'none';
        await afterLogin();
    } catch (err) {
        showToast(err.message || 'Fehler beim Einloggen.');
    } finally {
        btn.disabled = false; btn.textContent = 'Einloggen';
    }
}

// ── After Login ───────────────────────────────────────────────────────────────

async function afterLogin() {
    registerPush().catch(() => {});

    const urlParams  = new URLSearchParams(window.location.search);
    const lobbyParam = sessionStorage.getItem('da_pending_lobby') || urlParams.get('lobby');
    const gameParam  = sessionStorage.getItem('da_pending_game')  || urlParams.get('game');

    sessionStorage.removeItem('da_pending_lobby');
    sessionStorage.removeItem('da_pending_game');

    if (lobbyParam) {
        await joinLobbyByToken(lobbyParam);
    } else if (gameParam) {
        await openGame(gameParam);
    } else {
        showHomeScreen();
    }
}

// ── Push Registration ─────────────────────────────────────────────────────────

async function registerPush() {
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return;
        }
        sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
    }

    const key  = sub.getKey('p256dh');
    const auth = sub.getKey('auth');
    if (!key || !auth) return;

    await api.post('/api/push/subscribe', {
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(key))),
        auth:     btoa(String.fromCharCode(...new Uint8Array(auth))),
    });
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

window.handleLogin = handleLogin;
