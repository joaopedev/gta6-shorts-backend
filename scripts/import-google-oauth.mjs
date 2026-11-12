import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Uso: npm run setup:youtube -- "C:\\caminho\\client_secret.json"');
  process.exit(1);
}

const inputPath = path.resolve(input);
if (!existsSync(inputPath)) {
  console.error('Arquivo OAuth não encontrado.');
  process.exit(1);
}

let document;
try {
  document = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch {
  console.error('O arquivo informado não contém JSON válido.');
  process.exit(1);
}

const credentials = document.web ?? document.installed;
if (!credentials?.client_id || !credentials?.client_secret) {
  console.error('O JSON não contém client_id e client_secret do Google OAuth.');
  process.exit(1);
}

const expectedRedirect = 'http://localhost:4100/api/youtube/callback';
if (
  document.web &&
  Array.isArray(credentials.redirect_uris) &&
  credentials.redirect_uris.length > 0 &&
  !credentials.redirect_uris.includes(expectedRedirect)
) {
  console.error(`Adicione ${expectedRedirect} aos URIs de redirecionamento no Google Cloud e baixe o JSON novamente.`);
  process.exit(1);
}

if (document.web && !credentials.redirect_uris?.length) {
  console.warn(
    'O JSON foi baixado antes do callback ser cadastrado; usando a configuração salva no Google Cloud.',
  );
}

const envPath = path.resolve('.env');
const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const replace = (text, name, value) => {
  const line = `${name}=${value}`;
  const expression = new RegExp(`^${name}=.*$`, 'm');
  return expression.test(text) ? text.replace(expression, line) : `${text.trimEnd()}\n${line}\n`;
};

let updated = replace(current, 'YOUTUBE_CLIENT_ID', credentials.client_id);
updated = replace(updated, 'YOUTUBE_CLIENT_SECRET', credentials.client_secret);
updated = replace(updated, 'YOUTUBE_REDIRECT_URI', expectedRedirect);
writeFileSync(envPath, updated, { encoding: 'utf8', mode: 0o600 });

console.log('Credenciais OAuth importadas com segurança. O segredo não foi exibido.');
console.log('Reinicie o backend e use “Conectar com Google” no painel.');
