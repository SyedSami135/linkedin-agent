/**
 * LinkedIn OAuth 2.0 setup helper.
 * Run: npm run setup
 */

import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { input, password, confirm } from '@inquirer/prompts';
import axios from 'axios';
import 'dotenv/config';

const ENV_FILE = '.env';
const REDIRECT_URI = process.env['LINKEDIN_REDIRECT_URI'] ?? 'http://localhost:3000/callback';
const PORT = new URL(REDIRECT_URI).port || '3000';

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.warn('[setup] Could not open browser automatically. Open the URL manually.');
  });
}

async function readEnvFile(): Promise<Record<string, string>> {
  if (!existsSync(ENV_FILE)) return {};
  const content = await readFile(ENV_FILE, 'utf-8');
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) vars[match[1]!.trim()] = match[2]!.trim();
  }
  return vars;
}

async function writeEnvFile(vars: Record<string, string>): Promise<void> {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  await writeFile(ENV_FILE, lines.join('\n') + '\n', 'utf-8');
}

async function waitForCallback(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state) {
        res.end('State mismatch — possible CSRF. Close this tab.');
        reject(new Error('OAuth state mismatch'));
        server.close();
        return;
      }

      if (!code) {
        res.end('No code received. Close this tab and try again.');
        reject(new Error('No authorization code received'));
        server.close();
        return;
      }

      res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
      server.close();
      resolve(code);
    });

    server.listen(Number(PORT), () => {
      console.log(`[setup] Listening for OAuth callback on port ${PORT}...`);
    });

    server.on('error', reject);
  });
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await axios.post(
    'https://www.linkedin.com/oauth/v2/accessToken',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token as string;
}

async function fetchPersonUrn(accessToken: string): Promise<string> {
  const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const sub = response.data.sub as string;
  return `urn:li:person:${sub}`;
}

async function main(): Promise<void> {
  console.log('\n=== LinkedIn Agent Setup ===\n');
  console.log('This will walk you through LinkedIn OAuth 2.0 setup.\n');
  console.log('Before starting, create a LinkedIn app at:');
  console.log('  https://www.linkedin.com/developers/apps\n');
  console.log('Required products: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn"');
  console.log(`Required redirect URL in app settings: ${REDIRECT_URI}\n`);

  const ready = await confirm({ message: 'Have you created the LinkedIn app and noted your Client ID and Secret?' });
  if (!ready) {
    console.log('Please create the app first, then re-run `npm run setup`.');
    process.exit(0);
  }

  const envVars = await readEnvFile();

  const clientId =
    process.env['LINKEDIN_CLIENT_ID'] ??
    (await input({ message: 'LinkedIn Client ID:', default: envVars['LINKEDIN_CLIENT_ID'] }));

  const clientSecret =
    process.env['LINKEDIN_CLIENT_SECRET'] ??
    (await password({ message: 'LinkedIn Client Secret:' }));

  envVars['LINKEDIN_CLIENT_ID'] = clientId;
  envVars['LINKEDIN_CLIENT_SECRET'] = clientSecret;
  envVars['LINKEDIN_REDIRECT_URI'] = REDIRECT_URI;

  const state = randomBytes(16).toString('hex');
  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'openid profile w_member_social');
  authUrl.searchParams.set('state', state);

  console.log('\nOpening browser for LinkedIn authorization...');
  console.log(`\nIf the browser does not open, visit:\n  ${authUrl.toString()}\n`);
  openBrowser(authUrl.toString());

  let code: string;
  try {
    code = await waitForCallback(state);
  } catch (err) {
    console.error(`\n[setup] Callback failed: ${err}`);
    code = await input({ message: 'Paste the "code" query parameter from the redirect URL:' });
  }

  console.log('\n[setup] Exchanging authorization code for access token...');
  const accessToken = await exchangeCodeForToken(code, clientId, clientSecret);

  console.log('[setup] Fetching your LinkedIn Person URN...');
  const personUrn = await fetchPersonUrn(accessToken);

  envVars['LINKEDIN_ACCESS_TOKEN'] = accessToken;
  envVars['LINKEDIN_PERSON_URN'] = personUrn;

  await writeEnvFile(envVars);

  console.log('\n✓ Setup complete!');
  console.log(`  Token written to .env`);
  console.log(`  Person URN: ${personUrn}`);
  console.log('\nNote: LinkedIn access tokens expire after ~60 days.');
  console.log('Re-run `npm run setup` to refresh when needed.\n');
  console.log('You can now run: npm run dev -- --now');
}

main().catch((err) => {
  console.error('[setup] Fatal error:', err);
  process.exit(1);
});
