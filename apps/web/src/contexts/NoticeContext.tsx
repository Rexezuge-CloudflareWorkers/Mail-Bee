import { createContext } from 'react';
import type { ShowNotice } from '@rexezuge/web';

export type NoticeContextValue = {
  showNotice: ShowNotice;
};

export const NoticeContext = createContext<NoticeContextValue | null>(null);
