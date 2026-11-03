import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TemClient } from '../src/scaleway.ts';
import type { TemMcpConfig } from '../src/config.ts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<TemMcpConfig> = {}): TemMcpConfig {
    return {
        accessKey: 'SCWXXXXXXXXXXXXXXXXX',
        secretKey: '11111111-1111-1111-1111-111111111111',
        projectId: '11111111-1111-1111-1111-111111111111',
        region: 'fr-par',
        sendingDomain: 'ai.svenlaa.eu',
        ...overrides,
    };
}

function makeClient(overrides: Partial<TemMcpConfig> = {}): TemClient {
    return new TemClient(makeConfig(overrides));
}

// ── resolveSender ───────────────────────────────────────────────────────────

describe('TemClient.resolveSender', () => {
    it('expands a bare local part to the configured domain', () => {
        const client = makeClient();
        const result = client.resolveSender('noreply');
        assert.equal(result.email, 'noreply@ai.svenlaa.eu');
        assert.equal(result.name, undefined);
    });

    it('passes through a full address at the correct domain', () => {
        const client = makeClient();
        const result = client.resolveSender('hello@ai.svenlaa.eu');
        assert.equal(result.email, 'hello@ai.svenlaa.eu');
    });

    it('includes the display name when provided', () => {
        const client = makeClient();
        const result = client.resolveSender('noreply', 'No Reply');
        assert.equal(result.email, 'noreply@ai.svenlaa.eu');
        assert.equal(result.name, 'No Reply');
    });

    it('rejects a full address at a different domain', () => {
        const client = makeClient();
        assert.throws(
            () => client.resolveSender('evil@evil.com'),
            /not allowed/,
        );
    });

    it('is case-insensitive for the domain check', () => {
        const client = makeClient();
        const result = client.resolveSender('Test@AI.Svenlaa.EU');
        assert.equal(result.email, 'Test@AI.Svenlaa.EU');
    });

    it('respects a custom sending domain', () => {
        const client = makeClient({ sendingDomain: 'example.com' });
        const result = client.resolveSender('bot');
        assert.equal(result.email, 'bot@example.com');
        assert.throws(
            () => client.resolveSender('x@ai.svenlaa.eu'),
            /not allowed/,
        );
    });
});

// ── node:sqlite audit log ───────────────────────────────────────────────────

describe('audit log (node:sqlite)', () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'tem-mcp-test-'));
        dbPath = join(dir, 'audit.db');
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('creates the sent_emails table and can insert/select', () => {
        const db = new DatabaseSync(dbPath);
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

        const insert = db.prepare(
            'INSERT INTO sent_emails (id, from_email, subject, recipients, status) VALUES (?, ?, ?, ?, ?)',
        );
        insert.run('msg-1', 'noreply@ai.svenlaa.eu', 'Hello', 'user@example.com', 'sent');

        const row = db
            .prepare('SELECT * FROM sent_emails WHERE id = ?')
            .get('msg-1') as Record<string, unknown>;

        assert.equal(row.from_email, 'noreply@ai.svenlaa.eu');
        assert.equal(row.subject, 'Hello');
        assert.equal(row.status, 'sent');
        assert.ok(typeof row.sent_at === 'string' && row.sent_at.length > 0);

        db.close();
    });
});

// ── Config validation ───────────────────────────────────────────────────────

describe('loadConfig', () => {
    const envKeys = [
        'SCW_ACCESS_KEY',
        'SCW_SECRET_KEY',
        'SCW_PROJECT_ID',
        'SCW_DEFAULT_PROJECT_ID',
        'SCW_DEFAULT_REGION',
        'TEM_SENDING_DOMAIN',
        'TEM_AUDIT_DB',
        'MCP_TRANSPORT',
        'MCP_AUTH_TOKEN',
    ];
    let saved: Record<string, string | undefined>;
    let tmpDir: string;
    let origCwd: string;

    beforeEach(() => {
        saved = {};
        for (const k of envKeys) {
            saved[k] = process.env[k];
            delete process.env[k];
        }
        // Run from a temp dir so the project's .env file is not picked up
        origCwd = process.cwd();
        tmpDir = mkdtempSync(join(tmpdir(), 'tem-mcp-cfg-'));
        process.chdir(tmpDir);
    });

    afterEach(() => {
        process.chdir(origCwd);
        rmSync(tmpDir, { recursive: true, force: true });
        for (const k of envKeys) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    it('throws when required env vars are missing', async () => {
        const { loadConfig } = await import('../src/config.ts');
        assert.throws(() => loadConfig(), /SCW_ACCESS_KEY/);
    });

    it('throws when MCP_AUTH_TOKEN is missing in http mode', async () => {
        process.env.SCW_ACCESS_KEY = 'SCWTEST';
        process.env.SCW_SECRET_KEY = 'secret';
        process.env.SCW_PROJECT_ID = 'proj';
        const { loadConfig } = await import('../src/config.ts');
        assert.throws(() => loadConfig(), /MCP_AUTH_TOKEN/);
    });

    it('loads config with defaults when all required vars are set', async () => {
        process.env.SCW_ACCESS_KEY = 'SCWTEST';
        process.env.SCW_SECRET_KEY = 'secret';
        process.env.SCW_PROJECT_ID = 'proj';
        process.env.MCP_AUTH_TOKEN = 'test-token';
        const { loadConfig } = await import('../src/config.ts');
        const config = loadConfig();
        assert.equal(config.accessKey, 'SCWTEST');
        assert.equal(config.region, 'fr-par');
        assert.equal(config.sendingDomain, 'ai.svenlaa.eu');
        assert.equal(config.transport, 'http');
        assert.equal(config.port, 3000);
    });

    it('accepts SCW_DEFAULT_PROJECT_ID as fallback for project ID', async () => {
        process.env.SCW_ACCESS_KEY = 'SCWTEST';
        process.env.SCW_SECRET_KEY = 'secret';
        process.env.SCW_DEFAULT_PROJECT_ID = 'fallback-proj';
        process.env.MCP_AUTH_TOKEN = 'test-token';
        const { loadConfig } = await import('../src/config.ts');
        const config = loadConfig();
        assert.equal(config.projectId, 'fallback-proj');
    });

    it('allows stdio transport without auth token', async () => {
        process.env.SCW_ACCESS_KEY = 'SCWTEST';
        process.env.SCW_SECRET_KEY = 'secret';
        process.env.SCW_PROJECT_ID = 'proj';
        process.env.MCP_TRANSPORT = 'stdio';
        const { loadConfig } = await import('../src/config.ts');
        const config = loadConfig();
        assert.equal(config.transport, 'stdio');
    });
});
