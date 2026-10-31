// Configuration from environment variables (twelve-factor); same names in every stack.

export interface Config {
  port: number;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  tokenTtlSeconds: number;
  corsOrigins: string[];
  requestTimeoutMs: number;
  webhookRetryBaseMs: number;
  webhookMaxAttempts: number;
}

const DEV_SECRET = 'dev-only-secret-change-me-0123456789abcdef';

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config: Config = {
    port: int(env.PORT, 8002, 'PORT'),
    jwtSecret: env.JWT_SECRET || DEV_SECRET,
    jwtIssuer: env.JWT_ISSUER || 'api-concepts',
    jwtAudience: env.JWT_AUDIENCE || 'api-concepts-clients',
    tokenTtlSeconds: int(env.TOKEN_TTL_SECONDS, 900, 'TOKEN_TTL_SECONDS'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    requestTimeoutMs: int(env.REQUEST_TIMEOUT_MS, 2000, 'REQUEST_TIMEOUT_MS'),
    webhookRetryBaseMs: int(env.WEBHOOK_RETRY_BASE_MS, 500, 'WEBHOOK_RETRY_BASE_MS'),
    webhookMaxAttempts: int(env.WEBHOOK_MAX_ATTEMPTS, 5, 'WEBHOOK_MAX_ATTEMPTS'),
  };
  if (Buffer.byteLength(config.jwtSecret) < 32) throw new Error('JWT_SECRET must be at least 32 bytes');
  return config;
}
