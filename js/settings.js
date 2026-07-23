// ── Einstellungen & Musik ─────────────────────────────────────────────────────
// Hintergrundmusik (Dauerloop) + Einstellungs-Modal: Musik an/aus, Lautstärke,
// 3D/2D-Renderer, Zug-beenden-Bestätigung, Push-Benachrichtigungen, Abmelden.
// Alle Einstellungen liegen in localStorage und gelten pro Gerät.

// Web Audio API statt <audio loop>: das native HTMLMediaElement ist für
// nahtloses Looping nicht geeignet (spult beim Loop-Punkt merklich neu auf,
// browserübergreifend unterschiedlich, keine Frage der Zuschnitt-Qualität).
// AudioBufferSourceNode.loop spielt stattdessen den kompletten dekodierten
// PCM-Puffer sample-genau — das ist die etablierte Methode für gapless Loops
// im Browser. Die Musikdaten kommen als base64 aus audio/theme_song_data.js
// (von audio/build_loop.js erzeugt, siehe dort für Naht-/Format-Begründung),
// NICHT per fetch() — index.html?debug=1 wird oft direkt per file:// geöffnet,
// wo fetch() auf lokale Dateien an Chromes CORS-Regel scheitert; ein normaler
// <script>-Tag lädt dagegen unter file:// wie unter http:// gleichermaßen.
const MUSIC_ON_KEY  = 'da_music_on';
const MUSIC_VOL_KEY = 'da_music_vol';

const musicCtx  = new (window.AudioContext || window.webkitAudioContext)();
let musicGain   = null;   // GainNode, bleibt über Start/Stopp hinweg bestehen (Lautstärke)
let musicBuffer = null;   // dekodierter AudioBuffer, wird nur einmal dekodiert
let musicSource = null;   // aktueller AudioBufferSourceNode (bei jedem Start neu, da er nur einmal gestartet werden kann)

function isMusicEnabled() { return localStorage.getItem(MUSIC_ON_KEY) !== '0'; }

function getMusicVolume() {
    const v = parseInt(localStorage.getItem(MUSIC_VOL_KEY), 10);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 60;
}

function base64ToArrayBuffer(b64) {
    const bin   = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

function ensureMusicGain() {
    if (!musicGain) {
        musicGain = musicCtx.createGain();
        musicGain.gain.value = getMusicVolume() / 100;
        musicGain.connect(musicCtx.destination);
    }
    return musicGain;
}

async function ensureMusicBuffer() {
    if (musicBuffer) return musicBuffer;
    if (typeof THEME_SONG_DATA_B64 === 'undefined') return null; // audio/theme_song_data.js fehlt/nicht gebaut
    const arrayBuffer = base64ToArrayBuffer(THEME_SONG_DATA_B64);
    musicBuffer = await musicCtx.decodeAudioData(arrayBuffer);
    return musicBuffer;
}

async function startMusic() {
    if (!isMusicEnabled()) return;
    const buffer = await ensureMusicBuffer();
    if (!buffer) return;
    if (musicCtx.state === 'suspended') await musicCtx.resume().catch(() => {});
    if (musicSource) { try { musicSource.stop(); } catch (_) {} }
    musicSource = musicCtx.createBufferSource();
    musicSource.buffer = buffer;
    musicSource.loop   = true;
    musicSource.connect(ensureMusicGain());
    musicSource.start();
}

function stopMusic() {
    if (musicSource) { try { musicSource.stop(); } catch (_) {} musicSource = null; }
}

function setMusicEnabled(on) {
    localStorage.setItem(MUSIC_ON_KEY, on ? '1' : '0');
    if (on) startMusic(); else stopMusic();
}

function setMusicVolume(v) {
    localStorage.setItem(MUSIC_VOL_KEY, String(v));
    ensureMusicGain().gain.value = v / 100;
}

// Autoplay-Policy: Browser starten einen AudioContext erst nach einer
// User-Geste. Die erste Interaktion (Tap/Klick/Taste) startet die Musik,
// danach entfernen sich die Listener selbst. Der Direktversuch darunter greift
// z.B. in installierten PWAs.
function _musicUnlock() {
    document.removeEventListener('pointerdown', _musicUnlock);
    document.removeEventListener('keydown', _musicUnlock);
    startMusic();
}
document.addEventListener('pointerdown', _musicUnlock);
document.addEventListener('keydown', _musicUnlock);
startMusic();

// Tab im Hintergrund → gesamten Audio-Graph pausieren, beim Zurückkommen fortsetzen.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) musicCtx.suspend().catch(() => {});
    else if (isMusicEnabled()) musicCtx.resume().catch(() => {});
});

// ── Renderer (2D/3D) ──────────────────────────────────────────────────────────
// Die eigentliche Entscheidung trifft js/render3d.js beim Laden (liest dieselbe
// localStorage-Einstellung). Ein Wechsel hier greift daher erst nach Reload —
// die URL bleibt beim Reload erhalten (?game=/?debug=/?state= je nach Modus),
// der Spielstand geht also nicht verloren.
const RENDERER_KEY = 'da_renderer';

function is3DRendererEnabled() {
    // ?r2d=1 in der URL überschreibt die gespeicherte Einstellung (Dev-Fallback,
    // siehe CLAUDE.md) — das Modal zeigt in dem Fall trotzdem den echten Wert an.
    return localStorage.getItem(RENDERER_KEY) !== '2d';
}

function setRenderer3D(on) {
    localStorage.setItem(RENDERER_KEY, on ? '3d' : '2d');
    window.location.reload();
}

// ── Zug-beenden-Bestätigung ───────────────────────────────────────────────────
const ENDTURN_CONFIRM_KEY = 'da_endturn_confirm';

function isEndTurnConfirmEnabled() { return localStorage.getItem(ENDTURN_CONFIRM_KEY) !== '0'; }

function setEndTurnConfirmEnabled(on) {
    localStorage.setItem(ENDTURN_CONFIRM_KEY, on ? '1' : '0');
}

// ── Einstellungs-Modal ────────────────────────────────────────────────────────

function openSettings() {
    document.getElementById('settings-overlay').style.display   = 'flex';
    document.getElementById('settings-music-toggle').checked    = isMusicEnabled();
    document.getElementById('settings-music-vol').value         = getMusicVolume();
    document.getElementById('settings-renderer-toggle').checked = is3DRendererEnabled();
    document.getElementById('settings-endturn-toggle').checked  = isEndTurnConfirmEnabled();
    // Abmelden nur im Servermodus (im Debug-/Legacy-Modus gibt es keinen Account)
    const loggedIn = typeof currentProfile !== 'undefined' && !!currentProfile;
    document.getElementById('settings-logout-btn').style.display = loggedIn ? 'block' : 'none';
    refreshPushSettingsRow();
}

function closeSettings() {
    document.getElementById('settings-overlay').style.display = 'none';
}

// Push-Status live ermitteln und dabei sicherstellen, dass eine vorhandene
// Subscription auch beim Server registriert ist (registerPush(false) postet
// eine bestehende Subscription erneut, ohne einen Permission-Prompt auszulösen).
async function refreshPushSettingsRow() {
    const statusEl = document.getElementById('settings-push-status');
    const btn      = document.getElementById('settings-push-btn');
    btn.style.display = 'none';

    const loggedIn = typeof currentProfile !== 'undefined' && !!currentProfile;
    if (!loggedIn) {
        statusEl.textContent = 'Nur im Online-Modus (mit Account) verfügbar.';
        return;
    }
    if (!pushSupported()) {
        statusEl.textContent = 'Auf diesem Gerät nicht verfügbar. Tipp für iOS: Seite über "Zum Home-Bildschirm" als App installieren.';
        return;
    }
    if (Notification.permission === 'denied') {
        statusEl.textContent = '🚫 Vom Browser blockiert. Bitte Benachrichtigungen in den Browser-/Website-Einstellungen wieder erlauben.';
        return;
    }

    statusEl.textContent = 'Prüfe Status...';
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub && Notification.permission === 'granted') {
            const synced = await registerPush(false).catch(() => false);
            statusEl.textContent = synced
                ? '✅ Aktiv auf diesem Gerät.'
                : '⚠️ Aktiv, aber Abgleich mit dem Server fehlgeschlagen — später erneut versuchen.';
        } else {
            statusEl.textContent = 'Nicht aktiviert — du verpasst, wenn du am Zug bist.';
            btn.style.display = 'block';
        }
    } catch (err) {
        console.error('[push] Statusprüfung fehlgeschlagen:', err);
        statusEl.textContent = 'Status konnte nicht ermittelt werden.';
        btn.style.display = 'block';
    }
}

async function handleSettingsEnablePush() {
    const btn = document.getElementById('settings-push-btn');
    btn.disabled = true; btn.textContent = 'Bitte warten...';
    try {
        const ok = await registerPush(true);
        showToast(ok ? 'Benachrichtigungen aktiviert!' : 'Berechtigung wurde nicht erteilt.');
    } catch (err) {
        console.error('[push] Manuelle Registrierung fehlgeschlagen:', err);
        showToast('Aktivierung fehlgeschlagen — siehe Konsole.');
    } finally {
        btn.disabled = false; btn.textContent = '🔔 Jetzt aktivieren';
        refreshPushSettingsRow();
    }
}

function handleLogout() {
    api.clearToken();
    window.location.href = window.location.pathname;
}

window.openSettings              = openSettings;
window.closeSettings             = closeSettings;
window.setMusicEnabled           = setMusicEnabled;
window.setMusicVolume            = setMusicVolume;
window.setRenderer3D             = setRenderer3D;
window.setEndTurnConfirmEnabled  = setEndTurnConfirmEnabled;
window.handleSettingsEnablePush  = handleSettingsEnablePush;
window.handleLogout              = handleLogout;
