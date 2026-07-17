import { createServer } from './server.js';
/** Hosted-transport entry point (Smithery / streamable HTTP). Kept as a named export for build tooling that expects it. */
export const createSandboxServer = () => createServer();
export { createServer, registerAllTools, VERSION } from './server.js';
