import { type BlimpConfig } from '../../config/blimpConfig';
import { ArenaWorld } from './ArenaWorld';
import { CityWorld } from './CityWorld';
import { NatureWorld } from './NatureWorld';
import { type SceneId, type World } from './World';

export { type SceneId, type World, type RingAnchor, sceneIds, sceneLabels } from './World';

export function createWorld(id: SceneId, seed: number, config: BlimpConfig): World {
  switch (id) {
    case 'arena':
      return new ArenaWorld(config);
    case 'nature':
      return new NatureWorld(seed);
    case 'city':
      return new CityWorld(seed);
    default:
      return new ArenaWorld(config);
  }
}
