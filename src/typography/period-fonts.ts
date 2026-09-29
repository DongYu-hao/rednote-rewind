const pixelFontURL = '/fonts/fusion-pixel-12px-monospaced-zh_hans.otf.woff2';
import fontLicense from '../assets/fonts/OFL.txt?raw';
import arkLicense from '../assets/fonts/LICENSES/ark-pixel/OFL.txt?raw';
import cubicLicense from '../assets/fonts/LICENSES/cubic-11/OFL.txt?raw';
import galmuriLicense from '../assets/fonts/LICENSES/galmuri/LICENSE.txt?raw';

/** Modern, openly licensed substitute with genuine 12-pixel outlines. */
export const periodPixelFontFamily = '"Fusion Pixel 12px Monospaced SC", monospace';
export const periodFontAssetURL = pixelFontURL;
export const periodFontLicense = [fontLicense, arkLicense, cubicLicense, galmuriLicense].join('\n\n');

type ResolveAssetURL = (path: string) => string;

/** Resolve with browser.runtime.getURL in content scripts, not the page origin. */
export function periodFontCSS(resolveAssetURL: ResolveAssetURL = path => path): string {
  const url = resolveAssetURL(pixelFontURL);
  // JSON quoting also escapes characters that could end a CSS URL string.
  return `/* ${periodFontLicense.replaceAll('*/', '* /')} */
@font-face {
  font-family: "Fusion Pixel 12px Monospaced SC";
  src: url(${JSON.stringify(url)}) format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}`;
}

/**
 * Define the face in the document scope so both reader and controls can use it.
 * A face declared only inside a shadow stylesheet is not reliable across engines.
 * The face itself is inert until some historical UI selects this family.
 */
export function mountPeriodFont(doc: Document, resolveAssetURL: ResolveAssetURL = path => path) {
  const style = doc.createElement('style');
  style.dataset.rewindFont = 'fusion-pixel';
  style.textContent = periodFontCSS(resolveAssetURL);
  (doc.head ?? doc.documentElement).append(style);
  // Warm the local face before the first terminal switch, reducing fallback reflow.
  void doc.fonts?.load('24px "Fusion Pixel 12px Monospaced SC"').catch(() => {});
  return {
    element: style,
    destroy() { style.remove(); },
  };
}
