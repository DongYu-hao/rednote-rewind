import type { HistoricalEra } from '../eras';

const graphemes = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' });
const pictograph = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u;
const flag = /\p{Regional_Indicator}/u;
const keycap = /^[#*0-9]\uFE0F?\u20E3$/u;
const modifiers = /[\uFE0E\uFE0F]|\p{Emoji_Modifier}/gu;
// These have ordinary punctuation, symbol or Chinese annotation uses. Only
// convert them when the author explicitly selected emoji presentation (FE0F).
const ordinarySymbol = /^[©®™‼⁉↔↕↖↗↘↙↩↪〰〽㊗㊙]\uFE0E?$/u;

const words: Readonly<Record<string, string>> = {
  '😀': ':)', '😃': ':)', '😄': ':D', '😁': ':D', '😊': ':)', '🙂': ':)', '☺': ':)',
  '😂': '[大笑]', '🤣': '[大笑]', '😆': ':D', '😅': '[苦笑]', '😉': ';)',
  '😢': '[流泪]', '😭': '[哭泣]', '😔': ':(', '🙁': ':(', '☹': ':(',
  '😡': '[生气]', '😠': '[生气]', '😮': ':O', '😯': ':O', '😲': ':O',
  '😛': ':P', '😜': ';P', '😝': ':P', '😎': 'B)', '🤔': '[思考]',
  '❤': '[喜爱]', '🧡': '[喜爱]', '💛': '[喜爱]', '💚': '[喜爱]', '💙': '[喜爱]',
  '💜': '[喜爱]', '🖤': '[喜爱]', '🤍': '[喜爱]', '🤎': '[喜爱]', '🩷': '[喜爱]',
  '🩵': '[喜爱]', '🩶': '[喜爱]', '💕': '[喜爱]', '💖': '[喜爱]', '💗': '[喜爱]',
  '💓': '[喜爱]', '💞': '[喜爱]', '💝': '[喜爱]', '💔': '[伤心]',
  '👍': '[赞同]', '👎': '[不赞同]', '👏': '[鼓掌]', '🙏': '[致谢]', '🤝': '[握手]',
  '👋': '[招手]', '👌': '[同意]', '✌': '[胜利]', '✍': '[书写]',
  '🔥': '[火焰]', '⭐': '[星]', '🌟': '[星]', '✨': '[闪光]', '🎉': '[庆祝]',
  '🎂': '[蛋糕]', '☕': '[咖啡]', '🍵': '[茶]', '🍎': '[苹果]', '🍚': '[米饭]',
  '🍜': '[面食]', '🍞': '[面包]', '🍰': '[蛋糕]', '🍺': '[啤酒]',
  '🐱': '[猫]', '🐈': '[猫]', '🐶': '[狗]', '🐕': '[狗]', '🐼': '[熊猫]',
  '🌸': '[花]', '🌹': '[玫瑰]', '🌻': '[花]', '🌲': '[树]', '🌿': '[植物]',
  '☀': '[晴]', '🌞': '[晴]', '🌧': '[雨]', '❄': '[雪]', '🌙': '[月亮]',
  '📷': '[照相机]', '📹': '[摄影机]', '🎥': '[影片]', '📺': '[电视]',
  '📞': '[电话]', '📱': '[电话]', '💻': '[计算机]', '📧': '[邮件]', '✉': '[邮件]',
  '🏠': '[住宅]', '🚗': '[汽车]', '✈': '[飞机]', '🚲': '[自行车]',
  '✅': '[通过]', '❌': '[未通过]', '⚠': '[注意]', '💡': '[提示]',
};

function historicalGraphic(cluster: string): string {
  if (ordinarySymbol.test(cluster)) return cluster;
  if (keycap.test(cluster)) return `[${cluster[0]}]`;
  if (!pictograph.test(cluster)) return cluster;
  if (flag.test(cluster) || cluster.startsWith('🏴') || cluster.startsWith('🏳')) return '[旗帜]';
  const plain = cluster.replace(modifiers, '');
  const known = words[plain];
  if (known) return known;
  if (plain.includes('\u200D')) {
    if (/[👧👦🧒]/u.test(plain) && /[👨👩🧑]/u.test(plain)) return '[家庭]';
    if (plain.includes('❤')) return '[喜爱]';
  }
  // One placeholder per complete cluster, including ZWJ, skin tones and tags.
  return '[图形]';
}

/** Display only: never apply to source DOM, drafts, identifiers, URLs or input. */
export function periodText(value: string, era: HistoricalEra): string {
  if (era === '2015') {
    // Conservative common pre-2015 repertoire. Never let newer ZWJ/skin-tone
    // combinations masquerade as a historic glyph; use a semantic fallback.
    const common = new Set([... '😀😃😄😁😊☺😂😆😅😉😢😭😔😡😠😮😯😲😛😜😝😎❤💛💚💙💜💕💖💗💓💞💝💔👍👎👏🙏👋👌✌🔥⭐🌟✨🎉🎂☕🍵🍎🍚🍜🍞🍰🍺🐱🐈🐶🐕🐼🌸🌹🌻🌲🌿☀🌞❄🌙📷📹🎥📺📞📱💻📧✉🏠🚗✈🚲✅❌⚠💡']);
    return [...graphemes.segment(value)].map(({ segment }) => common.has(segment.replace(/[\uFE0E\uFE0F]/g, '')) ? segment : historicalGraphic(segment)).join('');
  }
  if (!['1985', '1991', '1995', '2000', '2005', '2010'].includes(era)) return value;
  return [...graphemes.segment(value)].map(item => historicalGraphic(item.segment)).join('');
}
