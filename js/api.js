// ── API Client ────────────────────────────────────────────────────────────────
// Thin fetch() wrapper that attaches the JWT from localStorage.
// All requests go to the same origin (the Express server serves the frontend).

const api = (() => {
    const TOKEN_KEY = 'da_token';

    function getToken()    { return localStorage.getItem(TOKEN_KEY); }
    function setToken(t)   { localStorage.setItem(TOKEN_KEY, t); }
    function clearToken()  { localStorage.removeItem(TOKEN_KEY); }

    async function request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
            let msg = res.statusText;
            try { const j = await res.json(); msg = j.error || msg; } catch (_) {}
            throw new Error(msg);
        }

        return res.json();
    }

    return {
        get:  (path)       => request('GET',    path),
        post: (path, body) => request('POST',   path, body),
        put:  (path, body) => request('PUT',    path, body),
        del:  (path)       => request('DELETE', path),
        getToken,
        setToken,
        clearToken,
    };
})();
