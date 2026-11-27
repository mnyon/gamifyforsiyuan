import { avatarLayers } from '../features/companion/application/projections.js';
import type { CompanionUser } from '../features/companion/domain/types.js';

/** The layer key that decides whether the avatar DOM must be rebuilt. */
export function avatarSignature(user: CompanionUser): string {
  const layers = avatarLayers(user),
    companions = user.items || {};
  return layers.join('|') + '|' + companions.currentMount + '|' + companions.currentPet;
}

// Classify sprite layers for the idle follow-through. Layers are full-canvas
// PNGs, so animating one image only moves the pixels of that item. Hair,
// headgear and eyewear share one subtle head-follow group.
function layerRole(name: string): string {
  if (name.startsWith('weapon_')) return ' layer-weapon';
  if (name.startsWith('shield_')) return ' layer-shield';
  if (name.startsWith('back_')) return ' layer-back';
  if (name === 'zzz') return ' layer-zzz';
  if (name.startsWith('hair_') || name.startsWith('headAccessory_') || name.startsWith('eyewear_'))
    return ' layer-head';
  if (name.startsWith('head_') && name !== 'head_0') return ' layer-head';
  return '';
}

/**
 * Rebuild the avatar sprite stack from the official Habitica assets.
 * .avatar-body carries the breathing bob (and aura), .avatar-fidget the
 * occasional gesture; mount + rider live inside, the pet stays outside so it
 * can bob on its own phase. Weapon/shield get a masked glint sibling.
 */
export function buildAvatar(avatar: HTMLElement, user: CompanionUser) {
  const layers = avatarLayers(user),
    companions = user.items || {};
  avatar.replaceChildren();
  const mount = /^[\w-]+$/.test(companions.currentMount || '') ? companions.currentMount || '' : '';
  const pet = /^[\w-]+$/.test(companions.currentPet || '') ? companions.currentPet || '' : '';
  avatar.classList.toggle('has-mount', !!mount);
  avatar.classList.toggle('has-pet', !!pet);
  avatar.classList.toggle('is-sleeping', !!user.preferences?.sleep);
  const placeholder = document.createElement('span');
  placeholder.className = 'placeholder';
  placeholder.textContent = '✧';
  const body = document.createElement('div');
  body.className = 'avatar-body';
  const fidget = document.createElement('div');
  fidget.className = 'avatar-fidget';
  body.append(fidget);
  avatar.append(placeholder, body);
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
        : 'character-layer' + (mount.includes('Kangaroo') ? ' kangaroo' : '') + layerRole(name);
    img.src = `https://habitica-assets.s3.amazonaws.com/mobileApp/images/${name}.png`;
    img.onload = () => {
      if (++loaded > 1) placeholder.hidden = true;
    };
    img.onerror = () => {
      img.remove();
      if (loaded < 2) placeholder.title = '角色素材暂时无法加载';
    };
    (name.startsWith('Pet-') ? avatar : fidget).append(img);
    // A masked sheen sweeping across the item's own pixels; the mask reuses
    // the sprite URL so the browser serves it from cache.
    if (name.startsWith('weapon_') || name.startsWith('shield_')) {
      const glint = document.createElement('i');
      glint.className =
        'glint' +
        (name.startsWith('shield_') ? ' glint-shield' : '') +
        (mount.includes('Kangaroo') ? ' kangaroo' : '');
      glint.style.setProperty('--glint-mask', `url("${img.src}")`);
      fidget.append(glint);
    }
  }
}
