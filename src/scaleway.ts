import { Temv1alpha1 } from '@scaleway/sdk';
import type { TemMcpConfig } from './config.ts';

/**
 * Thin wrapper around the Scaleway TEM API.
 * Uses the official @scaleway/sdk — no hand-rolled HTTP.
 */
export class TemClient {
    readonly api: Temv1alpha1.API;
    readonly config: TemMcpConfig;

    constructor(config: TemMcpConfig) {
        this.config = config;
        this.api = new Temv1alpha1.API({
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            defaultProjectId: config.projectId,
            defaultRegion: config.region as never,
        });
    }

    /**
     * Normalize a sender address: accepts either a bare local part
     * ("noreply") or a full email ("noreply@ai.svenlaa.eu") and always
     * returns a full address at the configured sending domain.
     */
    resolveSender(from: string, fromName?: string): Temv1alpha1.CreateEmailRequestAddress {
        const domain = this.config.sendingDomain;
        let email: string;

        if (from.includes('@')) {
            const [, fromDomain] = from.split('@');
            if (fromDomain.toLowerCase() !== domain.toLowerCase()) {
                throw new Error(
                    `Sender domain "${fromDomain}" is not allowed. ` +
                    `Only addresses @${domain} can be used.`,
                );
            }
            email = from;
        } else {
            // Bare local part — append the configured domain
            email = `${from}@${domain}`;
        }

        return { email, ...(fromName ? { name: fromName } : {}) };
    }
}
