export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * clamp(alpha, 0, 1);
}

export function approachExp(current: number, target: number, dt: number, timeConstant: number): number {
  if (timeConstant <= 0) {
    return target;
  }

  return lerp(current, target, 1 - Math.exp(-dt / timeConstant));
}

export function signedAngleDifference(a: number, b: number): number {
  let diff = (a - b + Math.PI) % (Math.PI * 2);
  if (diff < 0) {
    diff += Math.PI * 2;
  }
  return diff - Math.PI;
}
