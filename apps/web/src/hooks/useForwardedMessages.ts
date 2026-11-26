import { useState } from 'react';
import type { ShowNotice } from '@rexezuge/web';
import { apiGet } from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { ForwardedMessageDto } from '../types';

type UseForwardedMessagesOptions = {
  showNotice: ShowNotice;
};

export function useForwardedMessages({ showNotice }: UseForwardedMessagesOptions) {
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ForwardedMessageDto[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const data = await apiGet<{ messages: ForwardedMessageDto[] }>('/user/application/messages', { applicationId: id });
      setMessages(data.messages);
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to load forwarded messages.'));
    } finally {
      setLoading(false);
    }
  };

  const open = (id: string) => {
    setApplicationId(id);
    void load(id);
  };

  const close = () => {
    setApplicationId(null);
    setMessages([]);
  };

  return { applicationId, messages, loading, open, close };
}
