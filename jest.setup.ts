import { Blob } from 'node:buffer';

if (typeof globalThis.File === 'undefined') {
  type SimpleFileOptions = {
    lastModified?: number;
    type?: string;
  };

  class SimpleFile extends Blob {
    readonly name: string;
    readonly lastModified: number;

    constructor(parts: unknown[] = [], filename = 'file', options: SimpleFileOptions = {}) {
      const safeParts = Array.isArray(parts) ? (parts as any[]) : [];
      super(safeParts, options);
      this.name = filename;
      this.lastModified = options.lastModified ?? Date.now();
    }
  }

  // @ts-expect-error - providing minimal File implementation for Node environments
  globalThis.File = SimpleFile;
}
