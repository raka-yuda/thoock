import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "./contracts";

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(
    root = process.env.LOCAL_STORAGE_PATH ??
      path.join(process.cwd(), "storage"),
  ) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-zA-Z0-9]+$/.test(key))
      throw new Error("Invalid storage key.");
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(`${this.root}${path.sep}`))
      throw new Error("Storage path is outside the configured root.");
    return resolved;
  }

  async put(key: string, data: Buffer, mimeType: string) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: "wx" }).catch(
      async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        await writeFile(target, data);
      },
    );
    return { key, size: data.byteLength, mimeType };
  }

  get(key: string) {
    return readFile(this.resolve(key));
  }
  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
  publicUrl(key: string) {
    return `/api/assets/${encodeURIComponent(key)}`;
  }
}
