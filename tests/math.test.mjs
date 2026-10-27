import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const temporary = await mkdtemp(join(tmpdir(), 'raven-math-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));
async function compile(sourcePath, name) {
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  output = output.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from ${JSON.stringify(specifier === '../utils/math' ? pathToFileURL(join(temporary, 'math.mjs')).href : import.meta.resolve(specifier))}`);
  const file = join(temporary, `${name}.mjs`); await writeFile(file, output);
  return import(pathToFileURL(file).href);
}
const { normalizeMathDelimiters } = await compile('../src/utils/math.ts', 'math');
const { InlineMarkdown } = await compile('../src/components/InlineMarkdown.tsx', 'InlineMarkdown');
const render = value => renderToStaticMarkup(React.createElement(InlineMarkdown, { children: value }));

test('inline titles render common arXiv math, including stars, inequalities, redshift and nuclear reactions', () => {
  const titles = [
    'Tidal contributions to neutron star orbital precession around Sgr $A^*$',
    'Quasar Selection and Final Southern $G_{\\rm RP}<16$ Sample',
    'SN Ares at $\\mathbf{z=1.276}$ with a Predicted Time Delay',
    '$El\\ Ascua$: An AGN at $z\\sim 3.8$',
    'UV Spectrum of Galaxies at $5.7 < z < 6.9$',
    'Direct measurement of the ${}^{23}\\mathrm{Mg}(p, γ){}^{24}\\mathrm{Al}$ reaction with $γ$-ray detectors',
    '$Δ(1232)$ isobars and neutrino opacities',
  ];
  for (const title of titles) {
    const html = render(title);
    assert.ok(html.includes('class="katex"'), title);
    assert.ok(!html.includes('katex-error'), title);
    assert.ok(!/<(?:p|div|a|button)\b/.test(html), 'button titles must contain inline markup only');
  }
});
test('summary math supports dollar, parenthesis and display delimiters without changing code or escaped currency', () => {
  assert.equal((render('摘要：$E=mc^2$，\\(x_1\\)，\\[y^2\\]，$$z^2$$。').match(/class="katex"/g) || []).length, 4);
  assert.equal(normalizeMathDelimiters('`\\(x\\)` and ```\\[y\\]```'), '`\\(x\\)` and ```\\[y\\]```');
  assert.ok(!render('Budget \\$20; no math.').includes('class="katex"'));
});
test('inline rendering prevents nested links, remote images and untrusted HTML', () => {
  const html = render('[title](https://example.com) ![image](https://example.com/image.png) <script>alert(1)</script>');
  assert.ok(!/<(?:a|img|script)\b/.test(html));
  assert.ok(html.includes('title'));
});
