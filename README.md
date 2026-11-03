# tem-mcp

MCP (Model Context Protocol) server for [Scaleway Transactional Email (TEM)](https://www.scaleway.com/en/transactional-email/). Lets MCP consumers send emails from **any address @ `ai.svenlaa.eu`** (configurable).

Built for **Node.js 26+** — runs TypeScript natively with zero build step, uses built-in `node:test` and `process.loadEnvFile`. Only 3 runtime dependencies.

## Tools

| Tool | Description |
|---|---|
| `send_email` | Send an email from any `local@ai.svenlaa.eu` address. `from` accepts a bare local part (`"noreply"`) or full address — always resolved to the configured domain. |
| `list_emails` | List sent emails, filterable by domain. |
| `get_email` | Get full details of an email by ID. |
| `get_statistics` | Sending statistics (sent, delivered, bounced, …). |
| `cancel_email` | Cancel a pending (not yet sent) email. |
| `list_domains` | List registered sending domains. |

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `SCW_ACCESS_KEY` | yes | — | Scaleway access key |
| `SCW_SECRET_KEY` | yes | — | Scaleway secret key |
| `SCW_PROJECT_ID` (or `SCW_DEFAULT_PROJECT_ID`) | yes | — | Scaleway project ID |
| `MCP_AUTH_TOKEN` | yes (http mode) | — | Bearer token required on every MCP request |
| `MCP_TRANSPORT` | no | `http` | `http` (Streamable HTTP) or `stdio` |
| `MCP_HOST` | no | `127.0.0.1` | HTTP bind address |
| `MCP_PORT` | no | `3000` | HTTP port |
| `SCW_DEFAULT_REGION` | no | `fr-par` | Default region |
| `TEM_SENDING_DOMAIN` | no | `ai.svenlaa.eu` | Domain for sender addresses |

A `.env` file in the working directory is loaded automatically via `process.loadEnvFile()`.

## Usage

```bash
pnpm install
pnpm start          # HTTP server on 127.0.0.1:3000 (bearer auth)
MCP_TRANSPORT=stdio pnpm start   # local stdio mode (no token needed)
pnpm dev            # run with --watch for development
pnpm test           # run tests with node:test
```

### HTTP mode (remote, e.g. Vibe web)

The server speaks **Streamable HTTP** at `POST /mcp` (stateless). Every request
requires `Authorization: Bearer $MCP_AUTH_TOKEN`. `GET /health` is unauthenticated.

```
Vibe web ──HTTPS──► reverse proxy (TLS) ──► tem-mcp :3000/mcp ──► Scaleway TEM
```

Point your MCP client at `https://your-host/mcp` with the bearer token.
Put a TLS-terminating reverse proxy (Caddy/nginx) in front — the server itself
listens on plain HTTP on localhost.

### stdio mode (local)

```json
{
    "mcpServers": {
        "tem": {
            "command": "node",
            "args": ["/path/to/tem-mcp/src/index.ts"],
            "env": {
                "MCP_TRANSPORT": "stdio",
                "SCW_ACCESS_KEY": "SCW…",
                "SCW_SECRET_KEY": "…",
                "SCW_PROJECT_ID": "…"
            }
        }
    }
}
```

### Example: send an email

```json
{
    "tool": "send_email",
    "arguments": {
        "from": "noreply",
        "fromName": "My App",
        "to": [{ "email": "user@example.com", "name": "User" }],
        "subject": "Hello from TEM",
        "text": "Plain text body",
        "html": "<h1>HTML body</h1>"
    }
}
```

This sends from `noreply@ai.svenlaa.eu`.

## Architecture

```
src/
├── index.ts       # Entry point — HTTP (Streamable HTTP + bearer auth) or stdio transport
├── config.ts      # Env loading (process.loadEnvFile) + validation
├── scaleway.ts    # TemClient wrapper around @scaleway/sdk Temv1alpha1.API
└── tools.ts       # Tool definitions (zod schemas) registered on McpServer
test/
└── server.test.ts # Tests using node:test
```

### Node.js 26 features used

- **Native TypeScript** — `.ts` files run directly, no build step
- **`node:test`** — built-in test runner (`pnpm test`)
- **`process.loadEnvFile()`** — native `.env` loading, no `dotenv`
- **`util.styleText()`** — colored terminal output, no chalk
- **`node --watch`** — file watching for dev mode
- **`fetch` / `WebSocket`** — global, used internally by the SDKs
