import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import http from 'node:http';
import { exec } from 'node:child_process';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPE = 'openid profile email offline_access';

const oauthFilePath = (projectRoot) => path.join(projectRoot, '.avc', 'openai-oauth.json');

// Parse .env into key→value map
async function readEnv(envPath) {
  try {
    const lines = (await fs.readFile(envPath, 'utf8')).split('\n');
    const map = {};
    for (const line of lines) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
      if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return map;
  } catch {
    return {};
  }
}

// Update or insert a single key in .env, preserving all other lines
async function upsertEnvKey(envPath, key, value) {
  let content = '';
  try { content = await fs.readFile(envPath, 'utf8'); } catch {}
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.match(new RegExp(`^${key}\\s*=`)));
  const newLine = value ? `${key}=${value}` : '';
  if (idx >= 0) {
    if (newLine) {
      lines[idx] = newLine;
    } else {
      lines.splice(idx, 1);
    }
  } else if (newLine) {
    lines.push(newLine);
  }
  await fs.writeFile(envPath, lines.join('\n'), 'utf8');
}

// Decode a JWT payload (no verification needed — we trust our own callback)
function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split('.');
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

// Open URL in the system default browser
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"`
    : platform === 'win32'  ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error('[openai-oauth] Browser open failed:', err.message);
  });
}

/**
 * Spin up a temporary HTTP server on port 1455 to catch the OAuth callback.
 * Returns a Promise that resolves with the authorization code, or rejects on timeout/error.
 */
function waitForOAuthCallback(expectedState, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, 'http://localhost:1455');
      if (parsedUrl.pathname !== '/auth/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code  = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication complete. You can close this tab.</h2></body></html>');
      server.close();

      if (error) return reject(new Error(`OAuth error: ${error}`));
      if (state !== expectedState) return reject(new Error('State mismatch — possible CSRF'));
      if (!code) return reject(new Error('No code returned from OAuth server'));
      resolve(code);
    });

    server.on('error', (err) => reject(err));

    server.listen(1455, () => {
      console.log('[openai-oauth] Callback server listening on http://localhost:1455');
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth login timed out after 5 minutes'));
    }, timeoutMs);

    server.on('close', () => clearTimeout(timer));
  });
}

/**
 * Exchange the authorization code for tokens.
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri:  REDIRECT_URI,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

/**
 * @param {string} projectRoot
 * @param {() => object|null} getWebSocket  - lazy getter; returns the websocket object or null
 */
export function createOpenAIOAuthRouter(projectRoot, getWebSocket) {
  const router = express.Router();
  const envPath = path.join(projectRoot, '.env');

  // POST /login — start PKCE flow
  router.post('/login', async (req, res) => {
    try {
      // Generate PKCE
      const verifier  = crypto.randomBytes(32).toString('hex');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const state     = crypto.randomBytes(16).toString('hex');

      // Build authorize URL
      const params = new URLSearchParams({
        response_type:               'code',
        client_id:                   CLIENT_ID,
        redirect_uri:                REDIRECT_URI,
        scope:                       SCOPE,
        state,
        code_challenge:              challenge,
        code_challenge_method:       'S256',
        id_token_add_organizations:  'true',
        codex_cli_simplified_flow:   'true',
      });
      const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;

      // Open browser (best-effort)
      openBrowser(authorizeUrl);

      // Return immediately so the UI can show the URL
      res.json({ status: 'pending', authorizeUrl });

      // Handle callback asynchronously
      (async () => {
        try {
          const code = await waitForOAuthCallback(state);
          const tokens = await exchangeCodeForTokens(code, verifier);

          // Extract accountId from JWT payload
          const payload = decodeJwtPayload(tokens.access_token);
          const accountId = payload['https://api.openai.com/auth']?.chatgpt_account_id ?? '';

          // Persist tokens
          const oauthData = {
            access:    tokens.access_token,
            refresh:   tokens.refresh_token,
            expires:   Date.now() + (tokens.expires_in || 3600) * 1000,
            accountId,
          };
          await fs.writeFile(oauthFilePath(projectRoot), JSON.stringify(oauthData, null, 2), 'utf8');

          // Set auth mode in .env
          await upsertEnvKey(envPath, 'OPENAI_AUTH_MODE', 'oauth');

          // Notify UI via WebSocket
          const ws = getWebSocket();
          if (ws?.broadcast) {
            ws.broadcast({ type: 'openai-oauth-connected', accountId });
          }

          console.log(`[openai-oauth] Connected successfully (accountId: ${accountId})`);
        } catch (err) {
          console.error('[openai-oauth] Login flow error:', err.message);
          const ws = getWebSocket();
          if (ws?.broadcast) {
            ws.broadcast({ type: 'openai-oauth-error', error: err.message });
          }
        }
      })();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /status
  router.get('/status', async (req, res) => {
    try {
      const [env, oauthRaw] = await Promise.all([
        readEnv(envPath),
        fs.readFile(oauthFilePath(projectRoot), 'utf8').catch(() => null),
      ]);

      if (!oauthRaw || env.OPENAI_AUTH_MODE !== 'oauth') {
        return res.json({ connected: false });
      }

      const { accountId, expires } = JSON.parse(oauthRaw);
      res.json({
        connected:  true,
        accountId,
        expiresAt:  expires,
        expiresIn:  Math.max(0, Math.round((expires - Date.now()) / 1000)),
        fallback:   env.OPENAI_OAUTH_FALLBACK === 'true',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /test — fire a minimal prompt to verify the OAuth tokens work
  router.post('/test', async (req, res) => {
    try {
      const oauthRaw = await fs.readFile(oauthFilePath(projectRoot), 'utf8').catch(() => null);
      if (!oauthRaw) return res.status(400).json({ error: 'Not connected' });

      let { access, accountId, expires, refresh } = JSON.parse(oauthRaw);

      // Refresh if within 60s of expiry
      if (expires - Date.now() < 60_000) {
        const body = new URLSearchParams({
          grant_type:    'refresh_token',
          client_id:     CLIENT_ID,
          refresh_token: refresh,
        });
        const refreshResp = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!refreshResp.ok) return res.status(401).json({ error: 'Token refresh failed' });
        const refreshed = await refreshResp.json();
        access  = refreshed.access_token;
        refresh = refreshed.refresh_token || refresh;
        expires = Date.now() + (refreshed.expires_in || 3600) * 1000;
        await fs.writeFile(oauthFilePath(projectRoot), JSON.stringify({ access, refresh, expires, accountId }, null, 2), 'utf8');
      }

      const t0 = Date.now();
      const apiResp = await fetch('https://chatgpt.com/backend-api/codex/responses', {
        method: 'POST',
        headers: {
          'Authorization':      `Bearer ${access}`,
          'chatgpt-account-id': accountId,
          'Content-Type':       'application/json',
          'OpenAI-Beta':        'responses=experimental',
          'accept':             'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5.2-codex',
          instructions: 'You are a helpful assistant.',
          input: [{ role: 'user', content: 'Reply with exactly: "AVC OAuth test OK"' }],
        }),
      });

      if (!apiResp.ok) {
        const text = await apiResp.text();
        return res.status(502).json({ error: `API error ${apiResp.status}: ${text}` });
      }

      const data = await apiResp.json();
      const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? '(empty)';
      res.json({ ok: true, response: text.trim(), model: 'gpt-5.2-codex', elapsed: Date.now() - t0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /fallback — enable or disable API-key fallback
  router.post('/fallback', async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });

      if (enabled) {
        // Verify the API key exists and can reach OpenAI before enabling
        const env = await readEnv(envPath);
        if (!env.OPENAI_API_KEY) {
          return res.status(400).json({ error: 'OPENAI_API_KEY is not set. Add it first.' });
        }
        // Quick validation call
        const verifyResp = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        });
        if (!verifyResp.ok) {
          return res.status(400).json({ error: `API key verification failed (${verifyResp.status}). Check the key.` });
        }
        await upsertEnvKey(envPath, 'OPENAI_OAUTH_FALLBACK', 'true');
      } else {
        await upsertEnvKey(envPath, 'OPENAI_OAUTH_FALLBACK', '');
      }

      res.json({ status: 'ok', enabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /logout
  router.post('/logout', async (req, res) => {
    try {
      try { await fs.unlink(oauthFilePath(projectRoot)); } catch {}
      await upsertEnvKey(envPath, 'OPENAI_AUTH_MODE', '');
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
