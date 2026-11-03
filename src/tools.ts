import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TemClient } from './scaleway.ts';

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const addressSchema = z
    .object({
        email: z.string().email().describe('Recipient email address'),
        name: z.string().optional().describe('Display name'),
    })
    .describe('An email address with an optional display name');

const attachmentSchema = z.object({
    name: z.string().describe('Filename of the attachment'),
    type: z.string().describe('MIME type, e.g. "application/pdf"'),
    content: z.string().describe('Content encoded in base64'),
});

const headerSchema = z.object({
    key: z.string().describe('Header name'),
    value: z.string().describe('Header value'),
});

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer, client: TemClient): void {
    const domain = client.config.sendingDomain;

    // ── send_email ──────────────────────────────────────────────────────────
    server.registerTool(
        'send_email',
        {
            title: 'Send Email',
            description:
                `Send a transactional email via Scaleway TEM from any address @${domain}. ` +
                `The "from" field accepts either a bare local part (e.g. "noreply") or a full ` +
                `email address — it will always be resolved to the @${domain} domain.`,
            inputSchema: {
                from: z
                    .string()
                    .describe(
                        `Sender. Either a local part (e.g. "noreply" → noreply@${domain}) ` +
                            `or a full address @${domain} (e.g. "hello@${domain}")`,
                    ),
                fromName: z.string().optional().describe('Display name for the sender'),
                to: z
                    .array(addressSchema)
                    .min(1)
                    .describe('Primary recipients (at least one)'),
                cc: z.array(addressSchema).optional().describe('Carbon copy recipients'),
                bcc: z.array(addressSchema).optional().describe('Blind carbon copy recipients'),
                subject: z.string().describe('Email subject'),
                text: z.string().optional().describe('Plain-text body'),
                html: z.string().optional().describe('HTML body'),
                attachments: z.array(attachmentSchema).optional().describe('File attachments'),
                headers: z
                    .array(headerSchema)
                    .optional()
                    .describe('Additional email headers (key-value pairs)'),
                sendBefore: z
                    .string()
                    .datetime()
                    .optional()
                    .describe('ISO 8601 deadline — email will not be sent after this time'),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async (args) => {
            if (!args.text && !args.html) {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text' as const,
                            text: 'Either "text" or "html" (or both) must be provided.',
                        },
                    ],
                };
            }

            const from = client.resolveSender(args.from, args.fromName);

            const response = await client.api.createEmail({
                from,
                to: args.to,
                ...(args.cc?.length ? { cc: args.cc } : {}),
                ...(args.bcc?.length ? { bcc: args.bcc } : {}),
                subject: args.subject,
                text: args.text ?? '',
                html: args.html ?? '',
                ...(args.attachments?.length ? { attachments: args.attachments } : {}),
                ...(args.headers?.length
                    ? {
                          additionalHeaders: args.headers.map((h) => ({
                              key: h.key,
                              value: h.value,
                          })),
                      }
                    : {}),
                ...(args.sendBefore ? { sendBefore: new Date(args.sendBefore) } : {}),
            });

            const emails = response.emails.map((e) => ({
                id: e.id,
                status: e.status,
                from: e.from?.email,
                subject: e.subject,
                date: e.date,
            }));

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                sent: emails.length,
                                from: from.email,
                                emails,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );

    // ── list_emails ─────────────────────────────────────────────────────────
    server.registerTool(
        'list_emails',
        {
            title: 'List Emails',
            description: 'List emails sent via Scaleway TEM, optionally filtered by domain.',
            inputSchema: {
                domain: z
                    .string()
                    .optional()
                    .describe(`Filter by sending domain (default: ${domain})`),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe('Maximum number of emails to return (default: 20)'),
            },
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => {
            const response = await client.api.listEmails({
                domainName: args.domain ?? domain,
                pageSize: args.limit ?? 20,
            });

            const emails = response.emails.map((e) => ({
                id: e.id,
                status: e.status,
                from: e.from?.email,
                to: e.to?.map((t) => t.email),
                subject: e.subject,
                date: e.date,
            }));

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify({ total: response.totalCount, emails }, null, 2),
                    },
                ],
            };
        },
    );

    // ── get_email ───────────────────────────────────────────────────────────
    server.registerTool(
        'get_email',
        {
            title: 'Get Email',
            description: 'Get full details of a specific email by its ID.',
            inputSchema: {
                emailId: z.string().describe('The technical ID of the email'),
            },
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => {
            const email = await client.api.getEmail({ emailId: args.emailId });
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(email, null, 2),
                    },
                ],
            };
        },
    );

    // ── get_statistics ──────────────────────────────────────────────────────
    server.registerTool(
        'get_statistics',
        {
            title: 'Email Statistics',
            description: 'Get sending statistics (sent, delivered, bounced, etc.) for the domain.',
            inputSchema: {
                domain: z
                    .string()
                    .optional()
                    .describe(`Domain to get statistics for (default: ${domain})`),
            },
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => {
            const stats = await client.api.getStatistics({
                domainName: args.domain ?? domain,
            });
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(stats, null, 2),
                    },
                ],
            };
        },
    );

    // ── cancel_email ────────────────────────────────────────────────────────
    server.registerTool(
        'cancel_email',
        {
            title: 'Cancel Email',
            description: 'Cancel a pending email that has not been sent yet.',
            inputSchema: {
                emailId: z.string().describe('The technical ID of the email to cancel'),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async (args) => {
            const email = await client.api.cancelEmail({ emailId: args.emailId });
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            { id: email.id, status: email.status },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );

    // ── list_domains ────────────────────────────────────────────────────────
    server.registerTool(
        'list_domains',
        {
            title: 'List Domains',
            description: 'List all registered sending domains in the Scaleway project.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async () => {
            const response = await client.api.listDomains({});
            const domains = response.domains.map((d) => ({
                id: d.id,
                name: d.name,
                status: d.status,
                reputation: d.reputation?.status,
            }));
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify({ total: response.totalCount, domains }, null, 2),
                    },
                ],
            };
        },
    );
}
