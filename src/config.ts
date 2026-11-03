import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { styleText } from 'node:util';

// Load .env file if present — native Node.js, no dotenv dependency
if (existsSync('.env')) {
    loadEnvFile('.env');
}

export interface TemMcpConfig {
    accessKey: string;
    secretKey: string;
    projectId: string;
    region: string;
    /** The domain from which emails can be sent, e.g. "ai.svenlaa.eu" */
    sendingDomain: string;
    /** Optional: log every sent email to a local SQLite database */
    auditDbPath?: string;
    /** Transport mode: "http" (default) or "stdio" */
    transport: 'http' | 'stdio';
    /** HTTP listen host */
    host: string;
    /** HTTP listen port */
    port: number;
    /** Bearer token required on every MCP request when transport=http */
    authToken?: string;
}

function required(...names: string[]): string {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value;
    }
    throw new Error(
        styleText('red', `Missing required environment variable: ${names.join(' or ')}`),
    );
}

function optional(name: string, fallback: string): string {
    return process.env[name] ?? fallback;
}

const DEFAULT_PORT = 3000;

function portOrDefault(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT;
    return parsed;
}

export function loadConfig(): TemMcpConfig {
    const config: TemMcpConfig = {
        accessKey: required('SCW_ACCESS_KEY'),
        secretKey: required('SCW_SECRET_KEY'),
        projectId: required('SCW_PROJECT_ID', 'SCW_DEFAULT_PROJECT_ID'),
        region: optional('SCW_DEFAULT_REGION', 'fr-par'),
        sendingDomain: optional('TEM_SENDING_DOMAIN', 'ai.svenlaa.eu'),
        auditDbPath: process.env.TEM_AUDIT_DB,
        transport: process.env.MCP_TRANSPORT === 'stdio' ? 'stdio' : 'http',
        host: optional('MCP_HOST', '127.0.0.1'),
        port: portOrDefault(process.env.MCP_PORT),
        authToken: process.env.MCP_AUTH_TOKEN,
    };

    if (config.transport === 'http' && !config.authToken) {
        throw new Error(
            styleText(
                'red',
                'MCP_AUTH_TOKEN is required when MCP_TRANSPORT=http — ' +
                    'the HTTP endpoint sends real email and must not be unauthenticated.',
            ),
        );
    }

    // Validate the sending domain looks sane using RegExp.escape (Node 24+)
    const domainPattern = new RegExp(
        `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`,
        'i',
    );
    if (!domainPattern.test(config.sendingDomain)) {
        throw new Error(
            styleText('red', `Invalid TEM_SENDING_DOMAIN: ${config.sendingDomain}`),
        );
    }

    return config;
}
