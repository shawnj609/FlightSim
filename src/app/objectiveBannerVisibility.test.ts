import { describe, expect, test } from 'vitest';
import { ObjectiveBannerVisibility } from './objectiveBannerVisibility';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('ObjectiveBannerVisibility', () => {
  test('defaults to visible when no preference has been saved', () => {
    const visibility = new ObjectiveBannerVisibility(new MemoryStorage());

    expect(visibility.isVisible()).toBe(true);
  });

  test('persists a hidden objective banner so all modes stay uncluttered', () => {
    const storage = new MemoryStorage();
    const firstSession = new ObjectiveBannerVisibility(storage);

    firstSession.setVisible(false);

    const nextSession = new ObjectiveBannerVisibility(storage);
    expect(nextSession.isVisible()).toBe(false);
  });

  test('toggle returns the next visible state and saves it', () => {
    const storage = new MemoryStorage();
    const visibility = new ObjectiveBannerVisibility(storage);

    expect(visibility.toggle()).toBe(false);
    expect(new ObjectiveBannerVisibility(storage).isVisible()).toBe(false);

    expect(visibility.toggle()).toBe(true);
    expect(new ObjectiveBannerVisibility(storage).isVisible()).toBe(true);
  });
});
