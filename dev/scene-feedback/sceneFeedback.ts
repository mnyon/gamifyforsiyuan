// Scene feedback study: three candidate treatments on the real card.
// 1) Reward cheer: the avatar hops, the weapon lifts, the pet bounces.
// 2) Progress ambient: the pedestal and orbit glow follow editingApproach.
// 3) Rare easter egg: a meteor or a moon bloom after sustained writing.
// Preview-only; the plugin source stays untouched.
import { required } from '../../src/presentation/elements.js';
import { GamifyView } from '../../src/presentation/GamifyView.js';
import { newProgress } from '../../src/features/progress/domain/TodoProgress.js';
import type { CompanionUser } from '../../src/features/companion/domain/types.js';
import { PLUGIN_CSS as PREVIEW_CSS } from '../../src/presentation/css.js';

const SCENE_CSS = `
.card{position:relative;right:auto;bottom:auto;width:342px;max-width:100%;max-height:none;margin:0 auto;animation:none}
.card .close{display:none}
/* 1) Reward cheer — individual transform properties compose with the
   avatar's positioning transform, so no wrapper is needed. */
.avatar.cheer{animation:cheer-hop .72s cubic-bezier(.3,.7,.4,1)}
.avatar.cheer img[src*="weapon_"]{transform-origin:70% 62%;animation:weapon-cheer .72s ease-out}
.avatar.cheer img.pet-layer{animation:pet-cheer .72s ease-out .05s}
@keyframes cheer-hop{0%,100%{translate:0 0}26%{translate:0 -7px}50%{translate:0 0}66%{translate:0 -2.5px}80%{translate:0 0}}
@keyframes weapon-cheer{0%,100%{rotate:0deg}28%{rotate:-15deg}52%{rotate:-4deg}72%{rotate:-8deg}}
@keyframes pet-cheer{0%,100%{translate:0 0}30%{translate:0 -6px}56%{translate:0 0}72%{translate:0 -2px}}
/* 2) Progress ambient — bases match the plugin exactly at approach 0. */
.scene .pedestal{background:rgba(109,100,135,calc(.29 + var(--approach,0)*.22));box-shadow:0 0 calc(28px + var(--approach,0)*30px) rgba(195,160,250,calc(.094 + var(--approach,0)*.28))}
.scene .orbit{border-color:rgba(200,183,239,calc(.07 + var(--approach,0)*.15))}
.scene .orbit:after{border-color:rgba(200,183,239,calc(.063 + var(--approach,0)*.13))}
.ground-glow{position:absolute;left:50%;bottom:20px;width:150px;height:42px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(195,160,250,.3),transparent 70%);filter:blur(6px);opacity:var(--approach,0);pointer-events:none}
/* 3) Easter eggs — one meteor streak or a gentle moon halo. */
.meteor{position:absolute;top:0;left:0;width:2.5px;height:2.5px;border-radius:50%;background:#fffdf5;box-shadow:0 0 8px 2px rgba(233,221,255,.8);rotate:158deg;opacity:0;pointer-events:none;animation:meteor-fly 1.15s cubic-bezier(.25,.6,.35,1) forwards}
.meteor:after{content:'';position:absolute;left:-92px;top:.5px;width:92px;height:1.5px;border-radius:1px;background:linear-gradient(to right,transparent,rgba(200,183,239,.5) 55%,rgba(243,236,255,.9))}
@keyframes meteor-fly{0%{opacity:0;translate:252px 16px}10%{opacity:1}75%{opacity:.9}100%{opacity:0;translate:36px 100px}}
.moon.bloom{animation:moon-bloom 3.8s ease-out}
@keyframes moon-bloom{0%,100%{box-shadow:-6px 3px 0 0 #e1d0a8}30%{box-shadow:-6px 3px 0 0 #efe0b8,0 0 14px 3px rgba(238,226,196,.5)}60%{box-shadow:-6px 3px 0 0 #e8d9ae,0 0 10px 2px rgba(238,226,196,.28)}}
/* Lunar halo: a milky bloom far larger than the moon, with a faint outer
   ring that emerges after the core — warm moonlight fading into the purple
   night, blurred for haze. */
.moon-halo{position:absolute;top:-15px;right:9px;width:110px;height:110px;border-radius:50%;pointer-events:none;opacity:0;filter:blur(2.5px);background:radial-gradient(circle,rgba(238,226,196,.34) 0%,rgba(238,226,196,.15) 26%,rgba(214,203,238,.08) 52%,transparent 70%)}
.moon-halo:after{content:'';position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,transparent 50%,rgba(240,230,208,.3) 55%,rgba(240,230,208,.1) 60%,transparent 67%);opacity:0}
.moon-halo.bloom{animation:halo-bloom 3.8s cubic-bezier(.25,.6,.35,1) forwards}
.moon-halo.bloom:after{animation:halo-ring 3.8s ease-out forwards}
@keyframes halo-bloom{0%{opacity:0;transform:scale(.5)}18%{opacity:1}45%{opacity:.95;transform:scale(1)}75%{opacity:.6}100%{opacity:0;transform:scale(1.06)}}
@keyframes halo-ring{0%,22%{opacity:0}48%{opacity:1}78%{opacity:.5}100%{opacity:0}}
`;

const view = new GamifyView({
  css: PREVIEW_CSS,
  async onConnect() {},
  onSound() {},
});
view.soundEnabled = false;
const styles = document.createElement('style');
styles.textContent = SCENE_CSS;
view.root.append(styles);
required(document, '#stage').append(view.host);

const user: CompanionUser = {
  profile: { name: '预览冒险者' },
  stats: { lvl: 42, class: 'rogue', hp: 43, maxHealth: 50, gp: 128.5 },
  preferences: {
    skin: 'ddc994',
    size: 'slim',
    shirt: 'black',
    hair: { base: 1, bangs: 1, color: 'brown' },
  },
  items: {
    currentMount: 'Wolf-White',
    currentPet: 'Wolf-White',
    gear: {
      equipped: {
        armor: 'armor_rogue_4',
        head: 'head_rogue_4',
        weapon: 'weapon_rogue_4',
        shield: 'shield_rogue_4',
      },
    },
  },
};
const state = newProgress();
state.total = 14;
view.update({ state, user });
view.open();

const scene = required(view.root, '.scene');
const glow = document.createElement('div');
glow.className = 'ground-glow';
scene.insertBefore(glow, required(scene, '.avatar'));
const moonHalo = document.createElement('div');
moonHalo.className = 'moon-halo';
scene.insertBefore(moonHalo, required(scene, '.moon'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const status = required(document, '#status');

// 1) Reward cheer: hook the delegating reward method, throttle re-triggers.
const avatar = required(view.root, '.avatar');
let cheerTimer: number | undefined;
let lastCheer = -1000;
function cheer() {
  if (view.card.hidden || reduced.matches) return;
  const now = performance.now();
  if (now - lastCheer < 900) return;
  lastCheer = now;
  avatar.classList.remove('cheer');
  void avatar.offsetWidth;
  avatar.classList.add('cheer');
  clearTimeout(cheerTimer);
  cheerTimer = window.setTimeout(() => avatar.classList.remove('cheer'), 760);
}
const baseReward = view.rewardFeedback.bind(view);
view.rewardFeedback = (gold, context = {}) => {
  baseReward(gold, context);
  cheer();
};

// 2) Progress ambient: follow the eased approach the caret already computes.
let shown = 0;
function ambientLoop() {
  const target = view.caretFollower?.approach ?? view.caret.approach;
  shown += (target - shown) * 0.06;
  scene.style.setProperty('--approach', shown.toFixed(3));
  requestAnimationFrame(ambientLoop);
}
requestAnimationFrame(ambientLoop);

const editor = required(document, '.protyle-wysiwyg');
const slider = required(document, '#progress') as HTMLInputElement;
const output = required(document, '#percent');
let progress = 0.2;
function setProgress(value: number) {
  progress = Math.max(0, Math.min(1, value));
  slider.value = String(Math.round(progress * 100));
  output.textContent = Math.round(progress * 100) + '%';
  view.editingFeedback({ progress });
}
slider.addEventListener('input', () => setProgress(Number(slider.value) / 100));

// 3) Easter egg: sustained writing arms a random, cooldown-gated event.
let activeMs = 0,
  lastInputAt = 0,
  armedTimer: number | undefined,
  cooldownUntil = 0;
editor.addEventListener('input', () => {
  const now = performance.now();
  if (lastInputAt) activeMs += Math.min(now - lastInputAt, 2500);
  lastInputAt = now;
  setProgress(progress + 0.02);
  status.textContent = '正在积累。持续写作，场景也许会给一点小惊喜。';
});
function meteor() {
  if (reduced.matches) return;
  const m = document.createElement('i');
  m.className = 'meteor';
  scene.append(m);
  window.setTimeout(() => m.remove(), 1400);
}
function moonBloom() {
  if (reduced.matches) return;
  const moon = required(scene, '.moon');
  moon.classList.remove('bloom');
  moonHalo.classList.remove('bloom');
  void moon.offsetWidth;
  moon.classList.add('bloom');
  moonHalo.classList.add('bloom');
  window.setTimeout(() => {
    moon.classList.remove('bloom');
    moonHalo.classList.remove('bloom');
  }, 3900);
}
window.setInterval(() => {
  if (reduced.matches || armedTimer !== undefined || document.hidden) return;
  if (activeMs >= 60000 && performance.now() > cooldownUntil) {
    armedTimer = window.setTimeout(
      () => {
        armedTimer = undefined;
        activeMs = 0;
        cooldownUntil = performance.now() + 120000;
        if (!document.hidden && !reduced.matches) (Math.random() < 0.7 ? meteor : moonBloom)();
      },
      15000 + Math.random() * 45000,
    );
  }
}, 5000);

required(document, '#reward').onclick = () => {
  view.rewardFeedback(1.25, {});
  status.textContent = '奖励到账：角色小跳、武器微扬、宠物同步弹起。';
};
required(document, '#meteor').onclick = () => {
  meteor();
  status.textContent = '预览：流星掠过轨道环（正式触发需持续写作 + 随机等待）。';
};
required(document, '#moon').onclick = () => {
  moonBloom();
  status.textContent = '预览：月亮轻轻晕光（与流星二选一，随机出现）。';
};
setProgress(0.2);
