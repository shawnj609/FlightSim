import * as THREE from 'three';
import { type BlimpConfig } from '../../config/blimpConfig';
import { type AxisValues } from '../../sim/input';
import { type BlimpState } from '../../sim/physics';
import { createBlimpCraft } from './blimp';
import { createHelicopterCraft } from './helicopter';

/** A flyable craft model. Physics is identical for every craft — only the visuals differ. */
export interface Craft {
  group: THREE.Group;
  update: (state: BlimpState, controls: AxisValues, time: number, config: BlimpConfig) => void;
  dispose: () => void;
}

export type CraftId = 'blimp' | 'helicopter';

export const craftIds: CraftId[] = ['blimp', 'helicopter'];

export const craftLabels: Record<CraftId, string> = {
  blimp: 'Blimp',
  helicopter: 'LAPD helicopter'
};

export function createCraft(id: CraftId, config: BlimpConfig): Craft {
  return id === 'helicopter' ? createHelicopterCraft(config) : createBlimpCraft(config);
}
