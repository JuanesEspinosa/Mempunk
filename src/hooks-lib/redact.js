// Filtro de secretos de la captura automática: oculta el valor y deja el resto
// del texto, para que el contexto siga sirviendo. Se aplica ANTES de truncar: un
// secreto cortado deja de coincidir con su patrón y se guardaría a medias.
//
// Es de mejor esfuerzo: una contraseña sin nombre al lado (`clave abc`) no se
// detecta. Ante la duda oculta de más: perder una palabra cuesta menos que
// guardar una clave.

export const REDACTED = '[REDACTED]';

// Sin bloque de cierre solo avanza por base64: una mención de la cabecera no se
// lleva el resto del texto
const PEM_BEGIN_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;
const PEM_END_RE   = /-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const PEM_TAIL_RE  = /(?:[A-Za-z0-9+/=\s]|\\[rn])*/y;

const TOKEN_FORMATS = [
  'sk-ant-[\\w-]{20,}',                                 // Anthropic
  'sk-(?:proj-)?[A-Za-z0-9_-]{32,}',                    // OpenAI
  'sk_[a-f0-9]{40,}',                                   // ElevenLabs
  '[spr]k_(?:live|test)_[A-Za-z0-9]{16,}',              // Stripe
  'gsk_[A-Za-z0-9]{40,}',                               // Groq
  'gh[pousr]_[A-Za-z0-9]{30,}',                         // GitHub
  'github_pat_[A-Za-z0-9_]{30,}',
  'glpat-[\\w-]{20,}',                                  // GitLab
  'npm_[A-Za-z0-9]{30,}',                               // npm
  'hf_[A-Za-z0-9]{30,}',                                // Hugging Face
  'dop_v1_[a-f0-9]{40,}',                               // DigitalOcean
  'npg_[A-Za-z0-9]{8,}',                                // Neon
  'PK_[\\w-]{30,}',
  '(?:AKIA|ASIA)[A-Z0-9]{16}',                          // AWS
  'AIza[\\w-]{30,}',                                    // Google
  'xox[abprs]-[A-Za-z0-9-]{10,}',                       // Slack
  'SG\\.[\\w-]{16,}\\.[\\w-]{16,}',                     // SendGrid
  '\\d{8,10}:[\\w-]{35}',                               // Telegram
  'eyJ[\\w-]{10,}\\.eyJ[\\w-]{10,}\\.[\\w-]{10,}',      // JWT
  '(?:prv|pub)_(?:prod|test|stagtest)_[A-Za-z0-9]{16,}', // Wompi
  '(?:prod|test)_(?:integrity|events)_[A-Za-z0-9]{16,}',
];
const TOKEN_RE = new RegExp(`(?<![A-Za-z0-9_])(?:${TOKEN_FORMATS.join('|')})`, 'g');

// Sin `/` en la contraseña: `http://localhost:3000/pkg@1.2.3` no lleva credenciales
const URL_PASSWORD_RE = /\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/'"`<>]{0,128}:)[^\s/'"`<>\\]+(?=@)/gi;
const URL_TOKEN_RE    = /\b(https?:\/\/)[^\s:@/'"`<>]{20,}(?=@)/gi;

const AUTH_HEADER_RE = /\b((?:proxy-)?authorization\\?["']?\s*[:=]\s*\\?["']?(?:(?:bearer|basic|token|digest)\s+)?)[^\s"',;\\]+/gi;
const BEARER_RE      = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;
const COOKIE_RE      = /\b((?:set-)?cookie\\?["']?\s*:\s*\\?["']?)[^\r\n"'\\]+/gi;

// Un valor sin comillas acaba en un espacio, una comilla o un \n escapado (un
// .env volcado en una sola línea). Sin más cortes: `)` o `}` pueden ser parte de él
const BARE_VALUE = '(?:(?!\\\\[nrt])[^\\s"\'`])+';

const CURL_USER_RE = new RegExp(`((?:^|\\s)(?:-u|--user)[ =]["']?[^\\s:"']+:)${BARE_VALUE}`, 'g');
const CLI_FLAG_RE  = new RegExp(`(?<![\\w-])(--[\\w-]{1,64})( +)(${BARE_VALUE})`, 'g');
// `-p` solo significa contraseña en estos comandos
const SHORT_PASSWORD_FLAG_RE = new RegExp(
  `\\b((?:docker(?: +\\S+)? +login|sshpass|mysql|mysqldump|mariadb)\\b[^\\r\\n]{0,200}? -p ?)${BARE_VALUE}`,
  'g',
);

// El prefiltro de palabras es amplio a propósito (`key` entra): quién es secreto
// lo decide isSecretKey con el nombre partido en palabras. Topes de longitud para
// que un bloque enorme sin separadores no dispare el backtracking.
// De las dos alternativas con comillas dobles, la primera admite comillas
// escapadas en el valor y la segunda cubre el JSON dentro de JSON.
const KEY_CHAR = '[\\p{L}\\p{N}_.$-]';
const ASSIGNMENT_RE = new RegExp(
  `(?<!${KEY_CHAR})(${KEY_CHAR}{0,64}(?:pass|pwd|secret|token|key|contrase|credential)${KEY_CHAR}{0,64})`
  + `(\\\\?["'\`]?\\s*(?::=|=>|=|:)\\s*\\\\?)`
  + `(?:"((?:[^"\\\\\\r\\n]|\\\\.)*)"|"([^"\\r\\n]*)"|'([^'\\r\\n]*)'|\`([^\`\\r\\n]*)\`|(${BARE_VALUE}))`,
  'giu',
);

const SECRET_WORD_RE = /password|passwd|passphrase|pwd|contrase[nñ]a|(?:secret|token|credentials?|apikey|privatekey|accesskey|pass)$/;
const SECRET_PAIR_RE = /\b(?:api|private|access) key\b/;
// Variable de entorno `*_KEY`. En minúsculas no: `primary_key` es de bases de datos
const ENV_KEY_RE = /(?:^|[^A-Za-z0-9_])[A-Z0-9_]+_KEY$/;

// `TOKEN_URL`, `PASSWORD_FILE`: el nombre habla del secreto, el valor no lo es
const NON_SECRET_LAST_WORDS = new Set([
  'count', 'url', 'uri', 'endpoint', 'expiry', 'expires', 'ttl', 'type', 'name', 'limit',
  'length', 'file', 'path', 'id', 'enabled', 'required', 'hint', 'policy', 'field', 'label',
]);

// Tipos y literales: `password: string`, `token: true`
const NON_VALUES = new Set([
  'string', 'number', 'boolean', 'bool', 'true', 'false', 'null', 'undefined', 'none', 'nil',
  'object', 'required', 'optional',
]);

// Referencias, no valores: $(cmd), ${VAR}, $VAR, <placeholder>, {{ var }},
// process.env.X, llamadas a función y lo que ya se ocultó
const REFERENCE_RE = /^(?:\$[({A-Z_]|<[^>]*>|\{\{?[^}]*\}\}?|%\w|process\.|import\.meta|env\.|os\.environ|\[REDACTED\]|[\w.$]+\([^()]*\)[;,]?$)/;

const MIN_VALUE_CHARS = 4;

/** Palabras en minúsculas de un nombre: secretKey, SECRET_KEY y x-secret-key dan lo mismo. */
function keyWords(key) {
  return key.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function isSecretKey(key) {
  const words = keyWords(key);
  if (NON_SECRET_LAST_WORDS.has(words.at(-1))) return false;
  return ENV_KEY_RE.test(key) || words.some((word) => SECRET_WORD_RE.test(word)) || SECRET_PAIR_RE.test(words.join(' '));
}

function isSecretValue(value) {
  if (value.length < MIN_VALUE_CHARS || REFERENCE_RE.test(value)) return false;
  return !NON_VALUES.has(value.replace(/[;,.]+$/, '').toLowerCase());
}

function redactAssignment(match, key, separator, doubleQuoted, escapedClose, singleQuoted, backticked, bare) {
  const value = doubleQuoted ?? escapedClose ?? singleQuoted ?? backticked ?? bare;
  if (!isSecretKey(key) || !isSecretValue(value)) return match;
  const quote = bare !== undefined ? '' : match.at(-1);
  return `${key}${separator}${quote}${REDACTED}${quote}`;
}

function redactCliFlag(match, flag, spaces, value) {
  if (!isSecretKey(flag) || value.startsWith('-') || !isSecretValue(value)) return match;
  return `${flag}${spaces}${REDACTED}`;
}

/** Oculta los bloques PEM en tiempo lineal: un regex con cierre opcional se vuelve
 *  cuadrático con muchas cabeceras sin cierre, y los hooks corren en cada prompt. */
function redactPem(text) {
  let output = '';
  let position = 0;
  let mayHaveEnd = true; // sin esto, buscar el cierre en cada cabecera repite el recorrido
  for (;;) {
    PEM_BEGIN_RE.lastIndex = position;
    const begin = PEM_BEGIN_RE.exec(text);
    if (!begin) return output + text.slice(position);
    const bodyStart = begin.index + begin[0].length;
    let next = null;
    if (mayHaveEnd) {
      PEM_END_RE.lastIndex = bodyStart;
      const end = PEM_END_RE.exec(text);
      if (end) next = end.index + end[0].length;
      else mayHaveEnd = false;
    }
    if (next === null) {
      PEM_TAIL_RE.lastIndex = bodyStart;
      PEM_TAIL_RE.exec(text);
      next = PEM_TAIL_RE.lastIndex || bodyStart;
    }
    output += text.slice(position, begin.index) + REDACTED;
    position = next;
  }
}

/** Texto con los valores secretos ocultos. Lo que no es texto se devuelve tal cual. */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  return redactPem(text)
    .replace(TOKEN_RE, REDACTED)
    .replace(URL_PASSWORD_RE, `$1${REDACTED}`)
    .replace(URL_TOKEN_RE, `$1${REDACTED}`)
    .replace(AUTH_HEADER_RE, `$1${REDACTED}`)
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(COOKIE_RE, `$1${REDACTED}`)
    .replace(CURL_USER_RE, `$1${REDACTED}`)
    .replace(SHORT_PASSWORD_FLAG_RE, `$1${REDACTED}`)
    .replace(ASSIGNMENT_RE, redactAssignment)
    .replace(CLI_FLAG_RE, redactCliFlag);
}
