export interface PlaylistItem {
  id: string;
  title: string;
}

export class PlaylistStore {
  private data: Record<string, PlaylistItem[]> = {};

  constructor(private key = 'player.playlists') {
    try {
      this.data = JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      this.data = {};
    }
  }

  private save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      /* sem espaço ou bloqueado */
    }
  }

  names(): string[] {
    return Object.keys(this.data);
  }

  create(name: string): string | null {
    name = name.trim();
    if (!name) return null;
    if (!this.data[name]) {
      this.data[name] = [];
      this.save();
    }
    return name;
  }

  remove(name: string) {
    delete this.data[name];
    this.save();
  }

  add(name: string, track: PlaylistItem): boolean {
    const list = this.data[name];
    if (list && !list.some((t) => t.id === track.id)) {
      list.push({ id: track.id, title: track.title });
      this.save();
      return true;
    }
    return false;
  }

  removeTrack(name: string, id: string) {
    this.data[name] = (this.data[name] || []).filter((t) => t.id !== id);
    this.save();
  }

  tracks(name: string): PlaylistItem[] {
    return this.data[name] || [];
  }
}