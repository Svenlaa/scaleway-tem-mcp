#!/usr/bin/env node
/**
 * tem-mcp — MCP server for Scaleway Transactional Email (TEM)
 *
 * Lets MCP consumers send emails from any address @ai.svenlaa.eu
 * (configurable via TEM_SENDING_DOMAIN).
 *
 * Runs on Node.js 26+ with native TypeScript type stripping — no build step.
 *
 * Required env vars:
 *   SCW_ACCESS_KEY   — Scaleway access key
 *   SCW_SECRET_KEY   — Scaleway secret key
 *   SCW_PROJECT_ID   — Scaleway project ID
 *
 * Optional env vars:
 *   SCW_DEFAULT_REGION  — default region (default: fr-par)
 *   TEM_SENDING_DOMAIN  — sending domain (default: ai.svenlaa.eu)
 *   TEM_AUDIT_DB        — path to a SQLite file for audit logging
 */
import { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { styleText } from 'node:util';
import { loadConfig } from './config.ts';
import { TemClient } from './scaleway.ts';
import { registerTools } from './tools.ts';

// ── Audit log (optional, native node:sqlite — no dependency) ────────────────
let auditDb: DatabaseSync | undefined;

function initAuditDb(path: string): DatabaseSync {
    const db = new DatabaseSync(path);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sent_emails (
            id         TEXT PRIMARY KEY,
            from_email TEXT NOT NULL,
            subject    TEXT NOT NULL,
            recipients TEXT NOT NULL,
            status     TEXT,
            sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    return db;
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const config = loadConfig();

    if (config.auditDbPath) {
        auditDb = initAuditDb(config.auditDbPath);
        console.error(styleText('dim', `[tem-mcp] Audit log: ${config.auditDbPath}`));
    }

    const client = new TemClient(config);

    const server = new McpServer(
        {
            name: 'tem-mcp',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    registerTools(server, client);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(
        styleText(
            'green',
            `[tem-mcp] Server running — sending from any @${config.sendingDomain} (region: ${config.region})`,
        ),
    );

    // ── Graceful shutdown ───────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
        console.error(styleText('yellow', `[tem-mcp] Received ${signal}, shutting down…`));
        await server.close();
        auditDb?.close();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
    console.error(styleText('red', `[tem-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
});
