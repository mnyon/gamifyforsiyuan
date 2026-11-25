import { build } from 'esbuild';

export async function buildNoteWorld() {
  await build({
    entryPoints: {
      'hybrid-territory': 'dev/note-world/presentation/hybrid-territory.ts',
      'asset-gallery': 'dev/note-world/presentation/asset-gallery.ts',
      'voxel-assets': 'dev/note-world/presentation/assets.ts',
    },
    outdir: 'dist/previews/note-world',
    bundle: true,
    format: 'esm',
    target: 'es2022',
    external: ['three', 'three/addons/controls/OrbitControls.js'],
  });
}
