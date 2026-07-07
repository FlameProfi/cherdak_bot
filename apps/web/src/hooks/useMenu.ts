import { useEffect, useMemo, useState, useTransition } from 'react';
import { fetchMenu } from '../api/site';
import type { FeedbackState, MenuItem } from '../types';

interface UseMenuResult {
  groupedMenu: Record<string, MenuItem[]>;
  feedback: FeedbackState;
  isLoading: boolean;
}

function useMenu(): UseMenuResult {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      setIsLoading(true);
      try {
        const data = await fetchMenu();
        if (!cancelled) {
          startTransition(() => {
            setMenuItems(data.items || []);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            text: error instanceof Error ? error.message : 'Не удалось загрузить меню.'
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMenu();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedMenu = useMemo<Record<string, MenuItem[]>>(() => {
    return menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const category = item.category || 'Без категории';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});
  }, [menuItems]);

  return {
    groupedMenu,
    feedback,
    isLoading: isLoading || isPending
  };
}

export default useMenu;
