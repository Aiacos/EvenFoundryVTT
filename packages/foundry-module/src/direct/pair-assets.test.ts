/**
 * Static assets of the pairing window: stylesheet registered in module.json, template
 * free of inline styles, every `localize` key present in both locales.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('pairing window assets', () => {
  it('PAS-01 module.json registers styles/pair-g2.css and the file exists', () => {
    const manifest = JSON.parse(read('module.json')) as { styles?: string[] };
    expect(manifest.styles).toContain('styles/pair-g2.css');
    expect(existsSync(resolve(root, 'styles/pair-g2.css'))).toBe(true);
  });

  it('PAS-02 stylesheet rules are scoped under .evf-pair', () => {
    const css = read('styles/pair-g2.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((m) => m[2]?.trim() ?? '');
    expect(selectors.length).toBeGreaterThan(10);
    for (const group of selectors) {
      for (const selector of group.split(',')) {
        expect(selector.trim(), selector).toMatch(/\.evf-pair/);
      }
    }
  });

  it('PAS-03 template has no inline styles and every localize key exists in EN and IT', () => {
    const hbs = read('templates/pair-g2.hbs');
    expect(hbs).not.toMatch(/\sstyle=/);
    const en = JSON.parse(read('lang/en.json')) as Record<string, string>;
    const it = JSON.parse(read('lang/it.json')) as Record<string, string>;
    const keys = [...hbs.matchAll(/localize "([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      expect(en[key], key).toBeTypeOf('string');
      expect(it[key], key).toBeTypeOf('string');
    }
    expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort());
  });

  it('PAS-04 regression: an endpoint notice never calls the non-default address it shows «the default»', () => {
    // The template renders `{{localize label}} <code>{{url}}</code>` with the CURRENT value:
    // a label ending on «use the default page:» pointed the player at the broken LAN page.
    for (const lang of ['en', 'it']) {
      const strings = JSON.parse(read(`lang/${lang}.json`)) as Record<string, string>;
      for (const key of [
        'evf.pair.notice.app_insecure',
        'evf.pair.notice.relay_insecure',
        'evf.pair.notice.app_custom',
        'evf.pair.notice.relay_custom',
      ]) {
        const text = strings[key] ?? '';
        expect(text, `${lang} ${key}`).toMatch(/:$/);
        const lastSentence = text.split(/[.:]\s/).pop() ?? '';
        expect(lastSentence, `${lang} ${key}`).not.toMatch(
          /use the default|usa (la|il) .*predefinit/i,
        );
      }
    }
  });

  it('PAS-05 the QR can be enlarged: button + clickable QR wired to toggleQrSize, big layout styled', () => {
    const hbs = read('templates/pair-g2.hbs');
    const css = read('styles/pair-g2.css');
    expect(hbs.match(/data-action="toggleQrSize"/g)?.length).toBe(2);
    expect(hbs).toContain('evf.pair.qr_bigger');
    expect(hbs).toContain('evf.pair.qr_smaller');
    expect(hbs).toMatch(/evf-pair--big-qr/);
    expect(css).toMatch(/\.evf-pair--big-qr \.evf-pair__qr\s*\{[^}]*width:\s*min\(68vh, 520px\)/);
  });
});
