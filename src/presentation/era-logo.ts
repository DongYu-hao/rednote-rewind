import type { Era } from '../eras';

type LogoPlacement = 'page' | 'panel';
type ResolveAssetURL = (path: string) => string;

// Optical sizes account for the different silhouettes and transparent margins.
// Keep each era explicit: the 1995 welcome mark is larger than a toolbar mark.
export const eraLogoSizes = {
  '1995': { page: 88, panel: 52 },
  '2000': { page: 48, panel: 50 },
  '2005': { page: 44, panel: 44 },
  '2010': { page: 40, panel: 48 },
  '2015': { page: 46, panel: 50 },
} as const;

export function createEraLogo(doc: Document, era: Era, placement: LogoPlacement, resolveAssetURL: ResolveAssetURL = path => path): HTMLImageElement | null {
  if (era === '1985' || era === 'now') return null;
  const size = eraLogoSizes[era][placement];
  const image = doc.createElement('img');
  image.className = 'era-logo';
  image.dataset.eraLogo = era;
  image.dataset.logoPlacement = placement;
  // The adjacent brand/year already names the image. Avoid duplicate speech.
  image.alt = ''; image.setAttribute('aria-hidden', 'true');
  image.width = size; image.height = size; image.draggable = false;
  image.style.cssText = `display:block;width:${size}px;height:${size}px;max-width:none;max-height:none;object-fit:contain;flex:none;border:0;padding:0;margin:0;${era === '1995' ? 'image-rendering:pixelated;' : ''}`;
  image.src = resolveAssetURL(`/logos/eras/${era}.png`);
  // A missing packaged asset must not expose a broken-image glyph.
  image.addEventListener('error', () => { image.hidden = true; image.style.display = 'none'; }, { once: true });
  return image;
}
