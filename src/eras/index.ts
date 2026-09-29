export const eras = ['1985', '1995', '2000', '2005', '2010', '2015', 'now'] as const;
export type Era = typeof eras[number];
export type HistoricalEra = Exclude<Era, 'now'>;

export function normalizeEra(value: unknown): Era {
  if (value === '1991') return '1985'; // Migrate the retired historical preference.
  return eras.includes(value as Era) ? value as Era : 'now';
}

export const eraLabels: Record<Era, string> = {
  '1985': '一九八五年', '1995': '一九九五年', '2000': '二〇〇〇年', now: '当前',
  '2005': '二〇〇五年', '2010': '二〇一〇年', '2015': '二〇一五年',
};

export const isSocialEra = (era: string): era is '2005' | '2010' | '2015' => ['2005', '2010', '2015'].includes(era);
export const isStreamEra = (era: string) => era === '2010' || era === '2015';
