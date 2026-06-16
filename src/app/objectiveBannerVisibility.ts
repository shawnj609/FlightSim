const STORAGE_KEY = 'rc-blimp-objective-banner-visible-v1';

type VisibilityStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): VisibilityStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export class ObjectiveBannerVisibility {
  private visible = true;

  constructor(private readonly storage: VisibilityStorage | undefined = browserStorage()) {
    const saved = this.readSavedValue();
    this.visible = saved ?? true;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.save();
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  private readSavedValue(): boolean | undefined {
    try {
      const saved = this.storage?.getItem(STORAGE_KEY);
      if (saved === 'true') {
        return true;
      }
      if (saved === 'false') {
        return false;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, String(this.visible));
    } catch {
      // Local storage can be unavailable in private windows; the UI can still work for this session.
    }
  }
}
