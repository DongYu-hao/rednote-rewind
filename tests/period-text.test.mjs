import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/presentation/period-text.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { periodText } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('1985 displays simple faces and semantic labels without Unicode emoji', () => {
  assert.equal(periodText('你好😀，谢谢👍❤️☕🐱', '1985'), '你好:)，谢谢[赞同][喜爱][咖啡][猫]');
});
test('1995 uses one label for skin-tone and family clusters', () => {
  assert.equal(periodText('👍🏽👨‍👩‍👧‍👦', '1995'), '[赞同][家庭]');
});
test('regional and tag flags each stay a single graphic', () => {
  const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  assert.equal(periodText(`🇨🇳🇺🇸${england}`, '1985'), '[旗帜][旗帜][旗帜]');
});
test('keycap clusters convert whole while plain numbers and punctuation remain', () => {
  assert.equal(periodText('1️⃣2⃣#️⃣*️⃣ 12 # *', '1995'), '[1][2][#][*] 12 # *');
});
test('unknown joined graphic becomes one placeholder with no joiner fragments', () => {
  assert.equal(periodText('🧑🏾‍🚀🫠', '2000'), '[图形][图形]');
});
test('ordinary Chinese, punctuation, arrows and symbol text remain literal', () => {
  const value = '中华人民共和国：你好。〈目录〉【资料】★☆ © ® ™ ↔ ↗ 〰 〽 ㊗ ㊙ ‼ ⁉';
  assert.equal(periodText(value, '1985'), value);
});
test('explicit emoji variation differs from ordinary symbol text', () => {
  assert.equal(periodText('© ©️ ↗ ↗️ ㊗ ㊗️', '2000'), '© [图形] ↗ [图形] ㊗ [图形]');
});
test('display transformation preserves HTML-shaped text, quotes and newlines', () => {
  assert.equal(periodText('<b>😀</b> & "原文"\n第二行', '1995'), '<b>:)</b> & "原文"\n第二行');
});
test('2000 does not substitute a modern color emoji for an old face', () => {
  assert.equal(periodText('😊❤️👩‍❤️‍👩', '2000'), ':)[喜爱][喜爱]');
});
test('pure function leaves raw source string unchanged and results are stable', () => {
  const raw = '😀 原文 👍🏿';
  const shown = periodText(raw, '1985');
  assert.equal(raw, '😀 原文 👍🏿');
  assert.equal(shown, ':) 原文 [赞同]');
  assert.equal(periodText(raw, '1985'), shown);
});

test('2005 and 2010 keep textual faces; 2015 allows common old emoji but not recent clusters', () => {
  for (const era of ['2005', '2010']) assert.equal(periodText('你好😊👍🏽🫠', era), '你好:)[赞同][图形]');
  assert.equal(periodText('你好😊❤️👍🏽🫠', '2015'), '你好😊❤️[赞同][图形]');
});
