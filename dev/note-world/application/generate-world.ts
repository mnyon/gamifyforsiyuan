import { defaultRules, type World, type WorldInput, type WorldRules } from '../domain/world.js';
import { generateTerrain } from '../domain/terrain.js';
import { generateCities } from '../domain/cities.js';
import { generateRoutes } from '../domain/routes.js';

export function generateWorld(input: WorldInput, rules: WorldRules = defaultRules): World {
  const terrain = generateTerrain(rules);
  const cityPlan = generateCities(input, terrain, rules);
  const tracks = generateRoutes(input.citations, cityPlan.notes, terrain);
  return { terrain: { ...terrain, tracks }, ...cityPlan };
}
