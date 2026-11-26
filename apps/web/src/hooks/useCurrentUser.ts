import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import type { CurrentUser } from '../types';

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const me = await apiGet<CurrentUser>('/user/me');
        if (active) {
          setUser(me);
          setAuthorized(true);
        }
      } catch {
        if (active) setAuthorized(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { user, setUser, authorized };
}
