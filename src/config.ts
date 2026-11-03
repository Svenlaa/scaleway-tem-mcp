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

export function loadConfig(): TemMcpConfig {
    const config: TemMcpConfig = {
        accessKey: required('SCW_ACCESS_KEY'),
        secretKey: required('SCW_SECRET_KEY'),
        projectId: required('SCW_PROJECT_ID', 'SCW_DEFAULT_PROJECT_ID'),
        region: optional('SCW_DEFAULT_REGION', 'fr-par'),
        sendingDomain: optional('TEM_SENDING_DOMAIN', 'ai.svenlaa.eu'),
        auditDbPath: process.env.TEM_AUDIT_DB,
    };

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
