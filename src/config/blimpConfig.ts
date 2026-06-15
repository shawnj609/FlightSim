export interface BlimpConfig {
  mass: number;
  hullLength: number;
  hullWidth: number;
  hullHeight: number;
  buoyancyRatio: number;
  linearDrag: number;
  angularDrag: number;
  verticalThrust: number;
  forwardThrust: number;
  yawTorque: number;
  pitchTorque: number;
  motorLag: number;
  windStrength: number;
  deadzone: number;
  maxArenaHeight: number;
}

export const defaultBlimpConfig: BlimpConfig = {
  mass: 8.7,
  hullLength: 9.14,
  hullWidth: 1.52,
  hullHeight: 2.44,
  buoyancyRatio: 0.978,
  linearDrag: 1.35,
  angularDrag: 0.62,
  verticalThrust: 6.8,
  forwardThrust: 5.1,
  yawTorque: 3.4,
  pitchTorque: 2.9,
  motorLag: 1.45,
  windStrength: 0.42,
  deadzone: 0.08,
  maxArenaHeight: 11.5
};

export const configMetadata: Record<keyof BlimpConfig, { min: number; max: number; step: number; label: string }> = {
  mass: { min: 1, max: 14, step: 0.1, label: 'Mass (kg)' },
  hullLength: { min: 3, max: 14, step: 0.05, label: 'Hull length' },
  hullWidth: { min: 0.8, max: 4, step: 0.02, label: 'Hull width' },
  hullHeight: { min: 0.8, max: 4, step: 0.02, label: 'Hull height' },
  buoyancyRatio: { min: 0.9, max: 1.08, step: 0.001, label: 'Buoyancy ratio' },
  linearDrag: { min: 0.05, max: 4, step: 0.01, label: 'Linear drag' },
  angularDrag: { min: 0.05, max: 2.5, step: 0.01, label: 'Angular drag' },
  verticalThrust: { min: 0.2, max: 16, step: 0.05, label: 'Vertical thrust' },
  forwardThrust: { min: 0.2, max: 14, step: 0.05, label: 'Forward thrust' },
  yawTorque: { min: 0.05, max: 8, step: 0.01, label: 'Yaw torque' },
  pitchTorque: { min: 0.05, max: 8, step: 0.01, label: 'Pitch torque' },
  motorLag: { min: 0.05, max: 4, step: 0.01, label: 'Motor lag' },
  windStrength: { min: 0, max: 1.5, step: 0.01, label: 'Wind strength' },
  deadzone: { min: 0, max: 0.35, step: 0.005, label: 'Deadzone' },
  maxArenaHeight: { min: 4, max: 18, step: 0.1, label: 'Max arena height' }
};

export function netEffectiveMassGrams(config: BlimpConfig): number {
  return config.mass * (1 - config.buoyancyRatio) * 1000;
}
