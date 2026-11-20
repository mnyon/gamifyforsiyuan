import type { CollectionEnvironment } from '../application/CollectionSession.js';
export function browserCollectionEnvironment(scope: string): CollectionEnvironment {
  return {
    now: Date.now,
    visible: () => !document.hidden,
    schedule(callback, delay) {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
    async exclusively(work) {
      if (navigator.locks)
        await navigator.locks.request(
          'gamify-territory-collector:' + scope,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await work();
          },
        );
      else await work();
    },
  };
}
