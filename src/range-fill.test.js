import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { updateRangeFill } from './range-fill.js';

describe('Response slider track fill', () => {
  it.each([[.5, '0%', '5px'], [1.2, '35%', '1.5px'], [1.5, '50%', '0px'], [2.05, '77.5%', '-2.75px'], [2.5, '100%', '-5px']])('tracks the thumb centre at %s', (value, percent, offset) => {
    const styles = {};
    updateRangeFill({ min: '.5', max: '2.5', value: String(value), style: { setProperty: (key, value) => { styles[key] = value; } } });
    expect(styles).toEqual({ '--range-percent': percent, '--range-offset': offset });
  });
  it('updates both on startup and on every input event', () => {
    const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
    expect(main).toContain('updateRangeFill($("#sensitivity"))');
    expect(main).toMatch(/#sensitivity"\)\.addEventListener\("input",[\s\S]*?updateRangeFill\(event.target\)/);
    const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
    expect(css).toContain('calc(var(--range-percent) + var(--range-offset))');
    expect(css).not.toContain('#b48aff 0 38%');
  });
});
