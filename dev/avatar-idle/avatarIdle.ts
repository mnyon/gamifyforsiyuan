// Avatar idle study: a preview-only breathing bob with layered follow-through
// and scene atmosphere, isolated from the plugin. The plugin source stays
// untouched; this demo mirrors its scene and avatar layering.
import { required } from '../../src/presentation/elements.js';
import { avatarLayers } from '../../src/features/companion/application/projections.js';
import type { CompanionUser } from '../../src/features/companion/domain/types.js';
import PREVIEW_CSS from '../../src/presentation/styles.css';

// Candidate feature under review. --idle-amp is unitless so keyframes derive
// the pixel offset, the squash and the sway degrees from one slider.
// Secondary layers lag the body phase (follow-through); the glint reuses each
// sprite PNG as a mask so the sweep only touches that item's pixels; the
// pedestal shadow breathes in counter-phase to ground the bob; parallax uses
// the individual translate property so positioning transforms stay intact.
const IDLE_CSS = `
.stage-card{width:342px;max-width:100%;margin:auto;background:var(--panel);border:1px solid #ffffff1b;border-radius:20px;overflow:hidden;box-shadow:0 24px 80px #0005,0 4px 18px #0003}
.avatar-body{position:absolute;inset:0;transform-origin:bottom center;animation:avatar-idle var(--idle-period,3.2s) ease-in-out infinite,aura-breathe 6.4s ease-in-out infinite}
.aura-off .avatar-body{animation:avatar-idle var(--idle-period,3.2s) ease-in-out infinite}
.avatar-fidget{position:absolute;inset:0;transform-origin:bottom center;animation:fidget 14s ease-in-out infinite}
.fidget-off .avatar-fidget{animation:none}
.avatar img.pet-layer{animation:pet-idle calc(var(--idle-period,3.2s)*.84) ease-in-out calc(var(--idle-period,3.2s)*-.44) infinite}
.avatar img.layer-weapon{transform-origin:70% 62%;animation:weapon-sway var(--idle-period,3.2s) ease-in-out calc(var(--idle-period,3.2s)*.14) infinite}
.avatar img.layer-shield{transform-origin:30% 62%;animation:shield-sway var(--idle-period,3.2s) ease-in-out calc(var(--idle-period,3.2s)*.2) infinite}
.avatar img.layer-head{transform-origin:50% 22%;animation:head-follow var(--idle-period,3.2s) ease-in-out calc(var(--idle-period,3.2s)*.1) infinite}
.avatar img.layer-back{transform-origin:50% 30%;animation:cape-sway var(--idle-period,3.2s) ease-in-out calc(var(--idle-period,3.2s)*.18) infinite}
.glint{position:absolute;top:0;left:0;width:90px;height:90px;pointer-events:none;background:linear-gradient(115deg,transparent 42%,#ffffff59 47%,#ffffffb3 50%,#ffffff59 53%,transparent 58%);background-size:260% 100%;background-position:130% 0;background-repeat:no-repeat;-webkit-mask-image:var(--glint-mask);mask-image:var(--glint-mask);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;animation:glint-sweep 8.5s ease-in-out infinite}
.glint-shield{animation-delay:-4.2s}
.avatar.has-mount .glint{left:24px}
.avatar.has-mount .glint.kangaroo{top:24px}
.pedestal{animation:pedestal-breathe var(--idle-period,3.2s) ease-in-out infinite}
.star{animation:twinkle 4.2s ease-in-out infinite}
.s2{animation-delay:-1.4s}.s3{animation-delay:-2.6s}.s4{animation-delay:-3.4s}
.orbit:after{animation:orbit-spin 90s linear infinite}
.mote-ambient{position:absolute;bottom:44px;width:3px;height:3px;border-radius:50%;background:#d5c1ff;box-shadow:0 0 6px #c5acf9;opacity:0;pointer-events:none}
.m1{left:32%;animation:mote-rise 11s linear infinite}
.m2{left:58%;animation:mote-rise 13s linear -4s infinite}
.m3{left:72%;animation:mote-rise 9.5s linear -7s infinite}
.m4{left:44%;animation:mote-rise 14s linear -2s infinite}
.hill{translate:calc(var(--par-x,0)*3px) calc(var(--par-y,0)*1.5px)}
.orbit{translate:calc(var(--par-x,0)*1.5px) calc(var(--par-y,0)*1px)}
.moon{translate:calc(var(--par-x,0)*1px) calc(var(--par-y,0)*.6px)}
.avatar{translate:calc(var(--par-x,0)*-2px) calc(var(--par-y,0)*-1px)}
.avatar.is-sleeping img.layer-zzz{animation:zzz-drift 3.8s ease-in-out infinite}
.avatar.is-sleeping .avatar-body,.avatar.is-sleeping img,.idle-off .avatar-body,.idle-off .avatar img,.idle-off .glint,.idle-off .pedestal,.sleeping .pedestal,.sleeping .glint,.shadow-off .pedestal,.detail-off .avatar img.layer-weapon,.detail-off .avatar img.layer-shield,.detail-off .avatar img.layer-head,.detail-off .avatar img.layer-back,.atmo-off .star,.atmo-off .orbit:after,.atmo-off .mote-ambient{animation:none}
@keyframes avatar-idle{0%,100%{transform:translateY(0) scaleY(calc(1 - var(--idle-amp,1.5)/300))}50%{transform:translateY(calc(var(--idle-amp,1.5)*-1px)) scaleY(calc(1 + var(--idle-amp,1.5)/150))}}
@keyframes aura-breathe{0%,100%{filter:drop-shadow(0 0 2px #c5acf91f)}50%{filter:drop-shadow(0 0 8px #c5acf966)}}
@keyframes fidget{0%,84%,96%,100%{transform:none}87%{transform:rotate(-1.8deg) translateY(-1px)}90%{transform:rotate(1.1deg)}93%{transform:rotate(-.4deg)}}
@keyframes pet-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--idle-amp,1.5)*-1.33px))}}
@keyframes weapon-sway{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(calc(var(--idle-amp,1.5)*.8deg)) translateY(calc(var(--idle-amp,1.5)*-.4px))}}
@keyframes shield-sway{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(calc(var(--idle-amp,1.5)*-.5deg)) translateY(calc(var(--idle-amp,1.5)*-.3px))}}
@keyframes head-follow{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(calc(var(--idle-amp,1.5)*.3deg)) translateY(calc(var(--idle-amp,1.5)*-.25px))}}
@keyframes cape-sway{0%,100%{transform:rotate(0)}50%{transform:rotate(calc(var(--idle-amp,1.5)*.6deg))}}
@keyframes glint-sweep{0%,58%{background-position:130% 0}72%,100%{background-position:-30% 0}}
@keyframes pedestal-breathe{0%,100%{transform:translateX(-50%) scaleX(1);opacity:1}50%{transform:translateX(-50%) scaleX(.88);opacity:.7}}
@keyframes twinkle{0%,100%{opacity:.35}50%{opacity:.85}}
@keyframes orbit-spin{to{transform:rotate(360deg)}}
@keyframes mote-rise{0%{opacity:0;transform:translate(0,0)}12%{opacity:.5}55%{opacity:.35;transform:translate(6px,-46px)}100%{opacity:0;transform:translate(-3px,-84px)}}
@keyframes zzz-drift{0%,100%{transform:translateY(0);opacity:.75}50%{transform:translateY(-4px);opacity:1}}
`;

const host = required(document, '#stage');
const stage = host.attachShadow({ mode: 'open' });
// Scene markup mirrors GamifyView so the preview matches the plugin card;
// ambient motes are preview-only additions.
stage.innerHTML = `<style>${PREVIEW_CSS}</style><style>${IDLE_CSS}</style>
  <div class="stage-card"><div class="dashboard">
    <div class="scene"><div class="orbit"></div><i class="star s1">✦</i><i class="star s2">✧</i><i class="star s3">·</i><i class="star s4">✦</i><div class="moon"></div><div class="hill back"></div><div class="hill front"></div><div class="pedestal"></div><i class="mote-ambient m1"></i><i class="mote-ambient m2"></i><i class="mote-ambient m3"></i><i class="mote-ambient m4"></i><div class="avatar" role="img" aria-label="Habitica 角色"><span class="placeholder">✧</span></div></div>
    <div class="identity"><span class="eyebrow player-caption">YOUR ADVENTURE</span><h2 class="player-name"></h2><div class="player-meta"></div></div>
  </div></div>`;
const stageCard = required(stage, '.stage-card');

// Fictional account only; asset values follow the offline UI fixtures.
function preset(options: {
  pet?: string;
  mount?: string;
  sleep?: boolean;
  geared?: boolean;
  armed?: boolean;
}): CompanionUser {
  return {
    profile: { name: '预览冒险者' },
    stats: { lvl: 42, class: 'rogue', hp: 43, maxHealth: 50, gp: 128.5 },
    preferences: {
      skin: 'ddc994',
      size: 'slim',
      shirt: 'black',
      hair: { base: 1, bangs: 1, color: 'brown' },
      sleep: options.sleep,
    },
    items: {
      currentPet: options.pet,
      currentMount: options.mount,
      gear: {
        equipped: options.geared
          ? {
              armor: 'armor_rogue_4',
              head: 'head_rogue_4',
              weapon: 'weapon_rogue_4',
              shield: 'shield_rogue_4',
            }
          : options.armed
            ? { weapon: 'weapon_rogue_4', shield: 'shield_rogue_4' }
            : {},
      },
    },
  };
}
const presets = [
  { label: '轻装', note: '只有角色本体呼吸浮动。', user: preset({}) },
  {
    label: '持械带宠物',
    note: '武器与盾牌滞后摆动并有高光扫过，宠物错相位轻跳。',
    user: preset({ pet: 'Wolf-White', armed: true }),
  },
  {
    label: '骑乘',
    note: '坐骑与角色作为骑乘整体同动，全套装备分层随动。',
    user: preset({ mount: 'Wolf-White', pet: 'Wolf-White', geared: true }),
  },
  {
    label: '旅馆睡眠',
    note: '身体静止，zzz 缓慢上浮；影子停驻。',
    user: preset({ sleep: true }),
  },
];

// Classify sprite layers for secondary motion. Layers are full-canvas PNGs,
// so animating one image only moves the pixels of that item. Hair, headgear
// and eyewear share one subtle head-follow group.
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

// Mirrors GamifyView.update's avatar rebuild, plus the candidate wrappers:
// .avatar-body carries the breath, .avatar-fidget the occasional gesture;
// mount + rider live inside, the pet stays outside on its own phase.
function renderAvatar(user: CompanionUser) {
  const avatar = required(stage, '.avatar');
  avatar.replaceChildren();
  const layers = avatarLayers(user);
  const companions = user.items || {};
  const mount = /^[\w-]+$/.test(companions.currentMount || '') ? companions.currentMount || '' : '';
  const pet = /^[\w-]+$/.test(companions.currentPet || '') ? companions.currentPet || '' : '';
  const sleeping = !!user.preferences?.sleep;
  avatar.classList.toggle('has-mount', !!mount);
  avatar.classList.toggle('has-pet', !!pet);
  avatar.classList.toggle('is-sleeping', sleeping);
  stageCard.classList.toggle('sleeping', sleeping);
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
  required(stage, '.player-name').textContent = user.profile?.name || '冒险者';
  required(stage, '.player-meta').textContent = `Lv. ${user.stats?.lvl ?? 1} · 盗贼`;
}

const presetBox = required(document, '#presets');
const presetNote = required(document, '#preset-note');
const presetButtons = presets.map((entry, index) => {
  const button = document.createElement('button');
  button.textContent = entry.label;
  button.setAttribute('aria-pressed', String(index === 0));
  button.onclick = () => {
    presetButtons.forEach((other, i) => other.setAttribute('aria-pressed', String(i === index)));
    renderAvatar(entry.user);
    presetNote.textContent = entry.note;
  };
  presetBox.append(button);
  return button;
});

const toggle = required(document, '#idle-toggle');
let idleOn = true;
toggle.onclick = () => {
  idleOn = !idleOn;
  stageCard.classList.toggle('idle-off', !idleOn);
  toggle.setAttribute('aria-pressed', String(idleOn));
  toggle.textContent = idleOn ? '待机动画：开' : '待机动画：关（对照静止）';
};

// Compare the rigid whole-body bob against layered follow-through motion.
const detailToggle = required(document, '#detail-toggle');
let detailOn = true;
detailToggle.onclick = () => {
  detailOn = !detailOn;
  stageCard.classList.toggle('detail-off', !detailOn);
  detailToggle.setAttribute('aria-pressed', String(detailOn));
  detailToggle.textContent = detailOn ? '武器/细节随动：开' : '武器/细节随动：关（整体刚性）';
};

const amp = required(document, '#amp') as HTMLInputElement;
const ampOut = required(document, '#amp-out');
amp.oninput = () => {
  stageCard.style.setProperty('--idle-amp', amp.value);
  ampOut.textContent = `${Number(amp.value).toFixed(1)}px`;
};
const period = required(document, '#period') as HTMLInputElement;
const periodOut = required(document, '#period-out');
period.oninput = () => {
  stageCard.style.setProperty('--idle-period', `${period.value}s`);
  periodOut.textContent = `${Number(period.value).toFixed(1)}s`;
};

// The plugin stylesheet already disables every animation under
// prefers-reduced-motion; surface that state instead of overriding it.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionNote = required(document, '#motion-note');
function motionNotice() {
  motionNote.textContent = reduced.matches
    ? '系统已开启"减少动态效果"，动画按无障碍约定停用。'
    : '';
}
reduced.addEventListener('change', motionNotice);
motionNotice();

// Pointer parallax: eased toward the pointer, springs back on leave.
const panel = required(document, '.stage-panel');
let px = 0,
  py = 0,
  tx = 0,
  ty = 0,
  parFrame = 0;
function parLoop() {
  px += (tx - px) * 0.08;
  py += (ty - py) * 0.08;
  stageCard.style.setProperty('--par-x', px.toFixed(3));
  stageCard.style.setProperty('--par-y', py.toFixed(3));
  parFrame =
    Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002 ? requestAnimationFrame(parLoop) : 0;
}
function kick() {
  if (!parFrame) parFrame = requestAnimationFrame(parLoop);
}
panel.addEventListener('pointermove', (event) => {
  if (stageCard.classList.contains('parallax-off') || reduced.matches) return;
  const rect = panel.getBoundingClientRect();
  tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  kick();
});
panel.addEventListener('pointerleave', () => {
  tx = 0;
  ty = 0;
  kick();
});

// Visual enhancement pack: each effect can be isolated or stacked.
const fxOptions = [
  ['shadow', '地面阴影同步', '身体上浮时影子收缩变淡，落回时恢复，产生重量感。'],
  ['glint', '装备高光', '斜向高光周期扫过武器与盾牌，mask 限制在素材像素内。'],
  ['atmo', '场景氛围', '星光闪烁、轨道环缓转、浮尘上升。'],
  ['fidget', '偶尔小动作', '约每 14 秒一次短暂的重心转移，打破循环感。'],
  ['aura', '轮廓光晕', '沿角色剪影的呼吸紫光（drop-shadow）。'],
  ['parallax', '指针视差', '在预览区移动指针，山丘/轨道/角色分层微移。'],
] as const;
const fxBox = required(document, '#fx');
for (const [key, label, note] of fxOptions) {
  const item = document.createElement('label');
  item.className = 'fx-option';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('small');
  small.textContent = note;
  text.append(strong, small);
  item.append(box, text);
  box.onchange = () => {
    stageCard.classList.toggle(`${key}-off`, !box.checked);
    if (key === 'parallax' && !box.checked) {
      tx = 0;
      ty = 0;
      kick();
    }
  };
  fxBox.append(item);
}

renderAvatar(presets[0].user);
presetNote.textContent = presets[0].note;
