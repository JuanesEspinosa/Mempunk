import { describe, it, expect } from '@jest/globals';
import { redactSecrets, REDACTED } from '../src/hooks-lib/redact.js';

// Tokens de prueba armados por partes: ningún literal parece una clave real
const FAKE = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6uX9';
const GROQ      = 'gs' + 'k_' + FAKE + 'aB3dE6gH9jK2';
const GITHUB    = 'gh' + 'p_' + FAKE;
const NPM       = 'np' + 'm_' + FAKE;
const NEON      = 'np' + 'g_' + 'aB3dE6gH9jK2';
const ANTHROPIC = 'sk' + '-ant-api03-' + FAKE;
const AWS       = 'AK' + 'IAIOSFODNN7EXAMPLE';
const PK        = 'PK' + '_' + FAKE;
const JWT       = 'ey' + 'JhbGciOiJIUzI1NiJ9.ey' + 'JzdWIiOiIxMjM0NSJ9.' + FAKE;
const PEM_BODY  = Array.from({ length: 6 }, () => FAKE + 'aB3dE6gH9jK2mN5pQ8sT1').join('\n');
const PEM       = `-----BEGIN RSA PRIVATE KEY-----\n${PEM_BODY}\n-----END RSA PRIVATE KEY-----`;

describe('redactSecrets: formatos conocidos', () => {
  it.each([
    ['Groq', GROQ], ['GitHub', GITHUB], ['npm', NPM], ['Neon', NEON],
    ['Anthropic', ANTHROPIC], ['AWS', AWS], ['PK_', PK], ['JWT', JWT],
  ])('oculta %s y conserva el texto de alrededor', (_, secret) => {
    const out = redactSecrets(`usa la clave ${secret} en el servicio`);
    expect(out).toBe(`usa la clave ${REDACTED} en el servicio`);
  });

  it('oculta un bloque PEM completo', () => {
    const out = redactSecrets(`antes\n${PEM}\ndespués`);
    expect(out).toBe(`antes\n${REDACTED}\ndespués`);
  });

  it('oculta un PEM con saltos escapados y uno sin cierre', () => {
    expect(redactSecrets(`K="${PEM.replace(/\n/g, '\\n')}"`)).toBe(`K="${REDACTED}"`);
    expect(redactSecrets(`-----BEGIN PRIVATE KEY-----\n${PEM_BODY}`)).toBe(REDACTED);
  });

  it('una mención de la cabecera no se come el resto del texto', () => {
    const out = redactSecrets('el archivo empieza por -----BEGIN PRIVATE KEY----- y sigue, ¿verdad?');
    expect(out).toContain('¿verdad?');
  });
});

describe('redactSecrets: asignaciones', () => {
  it.each([
    ['DB_PASSWORD=hunter2x', 'DB_PASSWORD=[REDACTED]'],
    ['PGPASSWORD=hunter2x psql', 'PGPASSWORD=[REDACTED] psql'],
    ['export JWT_SECRET=mi-secreto-largo', 'export JWT_SECRET=[REDACTED]'],
    ['password: hunter2x', 'password: [REDACTED]'],
    ['Contraseña: Hunter2024*', 'Contraseña: [REDACTED]'],
    ['"password": "con espacios"', '"password": "[REDACTED]"'],
    ['{"clientSecret":"abcd1234","user":"ana"}', '{"clientSecret":"[REDACTED]","user":"ana"}'],
    ['$env:API_KEY="abcd1234"', '$env:API_KEY="[REDACTED]"'],
    ['X-API-Key: abcd1234efgh', 'X-API-Key: [REDACTED]'],
    ['mempunk --password hunter2x --json', 'mempunk --password [REDACTED] --json'],
    ['mempunk --token=hunter2x', 'mempunk --token=[REDACTED]'],
  ])('%s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it('separa los valores de un .env volcado en una línea con \\n escapado', () => {
    const out = redactSecrets('DB_HOST=localhost\\nDB_PASSWORD=hunter2x\\nDB_NAME=app\\nJWT_SECRET=otro-valor');
    expect(out).toBe('DB_HOST=localhost\\nDB_PASSWORD=[REDACTED]\\nDB_NAME=app\\nJWT_SECRET=[REDACTED]');
  });

  it('oculta el valor entero aunque lleve paréntesis o llaves', () => {
    expect(redactSecrets('password=Ab)cd}ef]gh')).toBe('password=[REDACTED]');
  });

  it('oculta JSON escapado dentro de otro JSON', () => {
    expect(redactSecrets('{\\"password\\":\\"hunter2x\\"}')).not.toContain('hunter2x');
  });
});

describe('redactSecrets: URLs y cabeceras', () => {
  it('conserva usuario y host de una URL con credenciales', () => {
    expect(redactSecrets('postgres://admin:s3cr3t@db.neon.tech/app'))
      .toBe('postgres://admin:[REDACTED]@db.neon.tech/app');
  });

  it('corta la contraseña de la URL en el \\n escapado', () => {
    expect(redactSecrets('mysql://u:clave1@h/db\\nMAIL=a@b.co')).toBe('mysql://u:[REDACTED]@h/db\\nMAIL=a@b.co');
  });

  it('oculta un token sin contraseña en la URL', () => {
    expect(redactSecrets('https://abcdefghijklmnopqrstuvwxyz@host.io/r.git')).toBe(`https://${REDACTED}@host.io/r.git`);
  });

  it('no toca una URL con puerto y @ en la ruta', () => {
    const url = 'http://localhost:3000/pkg@1.2.3';
    expect(redactSecrets(url)).toBe(url);
  });

  it('oculta Authorization y Bearer conservando el esquema', () => {
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNz')).toBe('Authorization: Basic [REDACTED]');
    expect(redactSecrets('curl -H "Authorization: Bearer abcd1234"')).toBe('curl -H "Authorization: Bearer [REDACTED]"');
    expect(redactSecrets('enviar Bearer abcdefghijklmnop1234')).toBe('enviar Bearer [REDACTED]');
  });

  it('oculta la contraseña de curl -u', () => {
    expect(redactSecrets('curl -u admin:hunter2x https://a.io')).toBe('curl -u admin:[REDACTED] https://a.io');
  });
});

describe('redactSecrets: fugas halladas en la revisión', () => {
  it.each([
    ['redis://:hunter2hunter2@host:6379', 'redis://:[REDACTED]@host:6379'],
    ['password=Pass(word)123', 'password=[REDACTED]'],
    ['password=a.b(c', 'password=[REDACTED]'],
    ['Cookie: session=abcdef123456789', 'Cookie: [REDACTED]'],
    ['Set-Cookie: sid=abcdef; Path=/', 'Set-Cookie: [REDACTED]'],
    ['ENCRYPTION_KEY=abcd1234', 'ENCRYPTION_KEY=[REDACTED]'],
    ['AZURE_STORAGE_KEY=abcd1234==', 'AZURE_STORAGE_KEY=[REDACTED]'],
    ['dbpass=hunter2hunter2', 'dbpass=[REDACTED]'],
    ['password: "p\\"ass\\"word123"', 'password: "[REDACTED]"'],
    ['docker login -p hunter2hunter2', 'docker login -p [REDACTED]'],
    ['sshpass -p hunter2hunter2 ssh host', 'sshpass -p [REDACTED] ssh host'],
    ['mysql -u root -phunter2 app', 'mysql -u root -p[REDACTED] app'],
    [`token ${'dop' + '_v1_' + 'ab12'.repeat(16)}`, `token ${REDACTED}`],
  ])('%s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each([
    'primary_key: id',
    'PRIMARY_KEY id',
    'foreignKey: userId',
    'const password = getPassword(req)',
  ])('no cambia: %s', (text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it.each([
    ['cabeceras repetidas', '-----BEGIN PRIVATE KEY-----'.repeat(30_000)],
    ['cuerpos cortados', '-----BEGIN PRIVATE KEY-----AAAA\n!'.repeat(25_000)],
  ])('PEM no se degrada con %s', (_, blob) => {
    const start = Date.now();
    redactSecrets(blob);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('redactSecrets: conserva el contexto', () => {
  it.each([
    'password: string',
    'const password = getPassword(req)',
    'PASSWORD=$(cat /run/secret)',
    'TOKEN=${API_TOKEN}',
    'DB_PASSWORD=$DB_PASSWORD',
    'password=<tu-clave>',
    'token: true',
    'max_tokens=4096',
    'tokens: 5000',
    'secretary: Ana',
    'keyboard: es-419',
    'monkey=banana',
    'PASSWORD_FILE=/run/secrets/db',
    'TOKEN_URL=https://auth.io/token',
    'token_count: 1200',
    'password=process.env.DB_PASSWORD',
    'sk-short es una clase de CSS',
    'la contraseña se pide al entrar',
  ])('no cambia: %s', (text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it('es idempotente', () => {
    const once = redactSecrets(`password=hunter2x ${GROQ} postgres://u:clave1@h/db`);
    expect(redactSecrets(once)).toBe(once);
  });

  it('devuelve tal cual lo que no es texto', () => {
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets('')).toBe('');
  });

  it('no se degrada con un bloque enorme sin separadores', () => {
    const blob = 'keyAb3'.repeat(400_000);
    const start = Date.now();
    redactSecrets(blob);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
