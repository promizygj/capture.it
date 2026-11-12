import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/** Artifacts (screenshots, diffs, baselines) live on local disk under STORAGE_DIR.
 *  Paths stored in the DB are relative so the storage root can move. */
export async function saveArtifact(relPath: string, data: Buffer): Promise<string> {
  const abs = resolveArtifact(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return relPath;
}

export function resolveArtifact(relPath: string): string {
  const abs = path.resolve(config.STORAGE_DIR, relPath);
  if (!abs.startsWith(config.STORAGE_DIR + path.sep)) throw new Error('Invalid artifact path');
  return abs;
}

export async function readArtifact(relPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveArtifact(relPath));
  } catch {
    return null;
  }
}

export async function removeArtifactDir(relDir: string) {
  await fs.rm(resolveArtifact(relDir), { recursive: true, force: true });
}
