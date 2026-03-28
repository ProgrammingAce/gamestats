import { opendir, stat } from 'fs/promises';
import { join } from 'path';

export class DirectorySizeCalculator {
  constructor() {
    this.abortController = null;
  }

  async calculateSize(path, signal) {
    this.abortController = new AbortController();
    const combinedSignal = this.mergeSignals(signal, this.abortController.signal);

    try {
      let totalSize = 0;
      await this.traverseDirectory(path, combinedSignal, (size) => {
        totalSize += size;
      });
      return totalSize;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Size calculation aborted');
      }
      throw err;
    }
  }

  async traverseDirectory(dirPath, signal, onFile) {
    try {
      const dir = await opendir(dirPath, { signal });

      for await (const entry of dir) {
        if (signal.aborted) {
          throw new Error('Aborted');
        }

        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.traverseDirectory(fullPath, signal, onFile);
        } else if (entry.isFile()) {
          try {
            const stats = await stat(fullPath, { signal });
            onFile(stats.size);
          } catch (err) {
            // Skip files that fail to stat
          }
        }
      }
    } catch (err) {
      if (err.code !== 'ERR_FS_EISDIR') {
        throw err;
      }
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  mergeSignals(signal1, signal2) {
    const controller = new AbortController();

    if (signal1) {
      if (signal1.aborted) {
        controller.abort();
      } else {
        signal1.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    if (signal2) {
      if (signal2.aborted) {
        controller.abort();
      } else {
        signal2.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    return controller.signal;
  }
}
