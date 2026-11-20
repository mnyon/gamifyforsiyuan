import type { CompanionOperationPorts } from './ports.js';

/** Acknowledgement only releases the pause. It never resubmits or guesses the remote result. */
export async function acknowledgeAction(
  confirmed: boolean,
  ports: CompanionOperationPorts,
): Promise<boolean> {
  if (!confirmed || !ports.journal.hasPending()) return false;
  const user = await ports.gateway.readPlayer();
  if (!ports.isCurrent()) throw new Error('连接已改变，请重新打开面板');
  ports.journal.clear();
  ports.onStatus('');
  ports.gateway.invalidateShops();
  ports.onShopsInvalidated();
  ports.onUser(user);
  return true;
}
