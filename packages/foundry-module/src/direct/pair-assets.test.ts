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
});
