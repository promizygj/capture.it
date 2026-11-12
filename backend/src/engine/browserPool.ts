import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserContextOptions, type BrowserType } from 'playwright';
import { logger } from '../lib/logger.js';

export type BrowserKind = 'chromium' | 'firefox' | 'webkit';
const types: Record<BrowserKind, BrowserType> = { chromium, firefox, webkit };

/** Every browser process launched anywhere in this process – used for emergency cleanup on shutdown. */
const liveBrowsers = new Set<Browser>();

/** Number of browser processes currently alive in this process (used to verify cleanup). */
export const liveBrowserCount = () => liveBrowsers.size;

export async function closeAllBrowsers() {
  const all = [...liveBrowsers];
  liveBrowsers.clear();
  await Promise.allSettled(all.map((b) => b.close()));
}

/**
 * Holds one browser process per kind for the lifetime of a run. Each test case gets its own isolated
 * BrowserContext. If the browser crashes or disconnects it is transparently relaunched for the next case.
 */
export class BrowserPool {
  private browsers = new Map<BrowserKind, Promise<Browser>>();

  constructor(private headless = true) {}

  async get(kind: BrowserKind): Promise<Browser> {
    let pending = this.browsers.get(kind);
    if (pending) {
      const b = await pending.catch(() => null);
      if (b && b.isConnected()) return b;
      this.browsers.delete(kind);
    }
    pending = this.launch(kind);
    this.browsers.set(kind, pending);
    return pending;
  }

  /**
   * Opens an isolated context. If the cached browser died (crash, OOM, killed) but has not reported the
   * disconnect yet, context creation fails – in that case the browser is discarded and relaunched once.
   */
  async newContext(kind: BrowserKind, options: BrowserContextOptions): Promise<{ browser: Browser; context: BrowserContext }> {
    let browser = await this.get(kind);
    try {
      return { browser, context: await browser.newContext(options) };
    } catch (err) {
      logger.warn('Context creation failed, relaunching browser', { kind, err: String(err) });
      this.browsers.delete(kind);
      await browser.close().catch(() => undefined);
      browser = await this.get(kind);
      return { browser, context: await browser.newContext(options) };
    }
  }

  private async launch(kind: BrowserKind): Promise<Browser> {
    const browser = await types[kind].launch({
      headless: this.headless,
      args: kind === 'chromium' ? ['--disable-dev-shm-usage', '--no-sandbox'] : [],
    });
    liveBrowsers.add(browser);
    browser.on('disconnected', () => {
      // Unexpected disconnects (crashes) are logged; intentional closes remove the browser first
      if (liveBrowsers.delete(browser)) logger.warn('Browser disconnected unexpectedly', { kind });
    });
    logger.info('Browser launched', { kind, version: browser.version() });
    return browser;
  }

  async close() {
    const all = await Promise.allSettled([...this.browsers.values()]);
    this.browsers.clear();
    await Promise.allSettled(
      all.map(async (r) => {
        if (r.status === 'fulfilled') {
          liveBrowsers.delete(r.value);
          await r.value.close();
        }
      }),
    );
  }
}
