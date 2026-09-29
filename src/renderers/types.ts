import type { NativeControl } from '../adapters/xiaohongshu/capabilities';
import type { Snapshot, Entry, Comment } from '../adapters/xiaohongshu';
import type { HistoricalEra } from '../eras';

export type PeriodAction = (HTMLAnchorElement | HTMLButtonElement) & { disabled: boolean };
export interface PeriodPageContext {
  doc: Document;
  era: HistoricalEra;
  data: Snapshot;
  entries: Entry[];
  comments: Comment[];
  discussionOpen: boolean;
  picturesOpen: boolean;
  navigation: HTMLElement;
  searchForm: HTMLFormElement;
  status: HTMLElement;
  footer: HTMLElement;
  createLogo(): HTMLImageElement | null;
  link(label: string, url: string): HTMLAnchorElement;
  action(label: string, name: string, run: () => void): PeriodAction;
  search(keyword: string): void;
  selectChannel(id: string, label: string): void;
  pagination(parent: HTMLElement, comments?: boolean): void;
  showDiscussion(): void;
  closeDiscussion(): void;
  showPictures(): void;
  mountImage(parent: HTMLElement, picture: Snapshot['images'][number], label: string, width: number, index?: number): void;
  mountInbox(parent: HTMLElement): void;
  mountCompose(parent: HTMLElement): void;
  mountActions(parent: HTMLElement, kinds: NativeControl['kind'][], subject?: string): void;
  copyLink(): void;
  mountVideo(parent: HTMLElement): void;
  text(value: string): string;
}
