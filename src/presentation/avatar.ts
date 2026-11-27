import { avatarLayers } from '../features/companion/application/projections.js';
import type { CompanionUser } from '../features/companion/domain/types.js';

/** The layer key that decides whether the avatar DOM must be rebuilt. */
export function avatarSignature(user: CompanionUser): string {
  const layers = avatarLayers(user),
    companions = user.items || {};
  return layers.join('|') + '|' + companions.currentMount + '|' + companions.currentPet;
}

/** Rebuild the avatar sprite stack from the official Habitica assets. */
export function buildAvatar(avatar: HTMLElement, user: CompanionUser) {
  const layers = avatarLayers(user),
    companions = user.items || {};
  avatar.replaceChildren();
  const mount = /^[\w-]+$/.test(companions.currentMount || '') ? companions.currentMount || '' : '';
  const pet = /^[\w-]+$/.test(companions.currentPet || '') ? companions.currentPet || '' : '';
  avatar.classList.toggle('has-mount', !!mount);
  avatar.classList.toggle('has-pet', !!pet);
  const placeholder = document.createElement('span');
  placeholder.className = 'placeholder';
  placeholder.textContent = '✧';
  avatar.append(placeholder);
  let loaded = 0;
  const assets = [
    ...(mount ? ['Mount_Body_' + mount] : []),
    ...layers,
    ...(mount ? ['Mount_Head_' + mount] : []),
    ...(pet ? ['Pet-' + pet] : []),
  ];
  for (const name of assets) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.className = name.startsWith('Mount_')
      ? 'mount-layer'
      : name.startsWith('Pet-')
        ? 'pet-layer'
        : 'character-layer' + (mount.includes('Kangaroo') ? ' kangaroo' : '');
    img.src = `https://habitica-assets.s3.amazonaws.com/mobileApp/images/${name}.png`;
    img.onload = () => {
      if (++loaded > 1) placeholder.hidden = true;
    };
    img.onerror = () => {
      img.remove();
      if (loaded < 2) placeholder.title = '角色素材暂时无法加载';
    };
    avatar.append(img);
  }
}
