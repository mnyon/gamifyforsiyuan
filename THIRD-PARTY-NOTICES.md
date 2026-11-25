# Third-party services and artwork

Habitica character images are loaded on demand from Habitica's official asset host. They are not bundled or relicensed by this project. Habitica artwork is credited to Habitica and its contributors and is subject to its own licensing terms. See https://github.com/HabitRPG/habitica/blob/develop/LICENSE for current terms.

The avatar layer order follows the public Habitica avatar component. This project is an independent integration and is not affiliated with Habitica.

The plugin icon and in-app gryphon mark come from Habitica's official press kit and source repository: [Icon.png](https://github.com/HabitRPG/habitica/blob/develop/website/client/public/static/presskit/Logo/Icon.png) and [gryphon.svg](https://github.com/HabitRPG/habitica/blob/develop/website/client/src/assets/svg/gryphon.svg). These marks belong to Habitica; using them identifies this integration and does not imply endorsement. README showcase images include Habitica character artwork with fictional demonstration data; that artwork remains subject to Habitica's own terms.

Completion sounds are synthesized locally using Web Audio; the background, stars, and particles are original CSS and SVG graphics.

Habitica-designed artwork is licensed by its creators under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). This covers the bundled gryphon files (`icon.png`, `icon.svg`, and the SVG embedded in `src/presentation/icon.ts`), plus Habitica artwork in `preview.png` and `images/*.png`. The showcase compositions containing that artwork are also provided under CC BY-NC-SA 3.0: credit Habitica and contributors for their artwork and Gamify for SiYuan contributors for the compositions, use them noncommercially, and share adaptations under the same license. The SVG's color inherits the surrounding interface; the PNG icon is unmodified. See `LICENSE-HABITICA.txt` for the upstream notice and full license. The MIT license applies to this project's original code, not to these third-party assets. No Habitica application code is copied into this plugin.

The bundled market backdrop and cropped merchant Alex are from Habitica's normal market artwork:
- https://github.com/HabitRPG/habitica/blob/develop/website/client/public/static/npc/normal/market_background.png
- https://github.com/HabitRPG/habitica/blob/develop/website/client/public/static/npc/normal/market_banner_npc.png
Only transparent padding is removed from the merchant image. These assets and the official item/skill descriptions in the minimal UI fixture are credited to Habitica and contributors under CC BY-NC-SA 3.0. New screenshots images/05-adventure.png through images/08-armoire.png contain the same licensed artwork and fictional account data; the compositions are provided under that license as well. The backpack illustration, frames and animation are original plugin graphics. Runtime character, skill and inventory sprites continue to load from Habitica's official asset host and use normal browser caching.

The archived note-territory experiment in `dev/note-world-continuous-terrain/` bundles Three.js 0.160.1 and its OrbitControls example under the MIT license. Copyright © 2010–2023 Three.js authors. The complete upstream license is included in that directory's `third_party/three/THREE-LICENSE.txt`. It is not part of the plugin build or runtime. The experiment's generated terrain, interface, and map symbols are original code; no Death Stranding, Lord of the Rings, or personal-knowledge-atlas artwork or source code is bundled.
