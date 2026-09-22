import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { oauthClient } from './google-auth.js';
import { safeError } from './reliability.js';

async function main() {
  const state = randomBytes(32).toString('hex');
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Không mở được OAuth callback');
  const redirect = `http://127.0.0.1:${address.port}/callback`;
  try {
    const client = oauthClient(process.env.GOOGLE_OAUTH_CLIENT_FILE ?? './secrets/oauth-client.json', redirect);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const { CodeChallengeMethod } = await import('google-auth-library');
    const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/spreadsheets'], state,
      code_challenge: codeChallenge!, code_challenge_method: CodeChallengeMethod.S256 });
    console.log('Mở URL sau trên trình duyệt máy này để cấp quyền Google (hết hạn sau 5 phút):\n' + url);
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hết thời gian đăng nhập')), 300_000);
      server.on('request', (req, res) => {
        const incoming = new URL(req.url ?? '/', redirect);
        if (incoming.pathname !== '/callback' || incoming.searchParams.get('state') !== state) {
          res.writeHead(400).end('Invalid callback'); return;
        }
        clearTimeout(timeout);
        const value = incoming.searchParams.get('code');
        if (!value) { res.end('Authorization denied'); reject(new Error('Google chưa cấp quyền')); return; }
        res.end('Da nhan ma. Ban co the dong tab va quay lai terminal.');
        resolve(value);
      });
    });
    const { tokens } = await client.getToken({ code, codeVerifier });
    if (!tokens.refresh_token) throw new Error('Không có refresh token; cấp lại quyền offline');
    const file = process.env.GOOGLE_OAUTH_TOKEN_FILE ?? './secrets/oauth-token.json';
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(tokens), { mode: 0o600 });
    console.log('Đã lưu token vào file secrets. Đặt GOOGLE_AUTH_MODE=oauth để sử dụng.');
  } finally { server.close(); }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
