import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

/**
 * Returns true iff the given `import.meta.url` belongs to the script that was
 * directly invoked by the Node/tsx process (i.e. `process.argv[1]`).
 * Used to guard top-level `main()` side effects so importing the module for
 * tests does not trigger pipeline execution.
 */
export const isMainModule = (importMetaUrl: string): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const modulePath = fileURLToPath(importMetaUrl);
    const entryPath = realpathSync(entry);
    return realpathSync(modulePath) === entryPath;
  } catch {
    return false;
  }
};
