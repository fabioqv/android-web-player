export type RepeatMode = 'off' | 'all' | 'one';

function shuffleArr<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export class PlayQueue {
  base: string[] = [];
  order: string[] = [];
  pos = -1;
  shuffle = false;
  repeat: RepeatMode = 'off';

  set(ids: string[], startId?: string) {
    this.base = ids.slice();
    this.build(startId ?? ids[0]);
  }

  private build(curId: string) {
    if (this.shuffle) {
      this.order = [curId, ...shuffleArr(this.base.filter((i) => i !== curId))];
      this.pos = 0;
    } else {
      this.order = this.base.slice();
      this.pos = Math.max(0, this.order.indexOf(curId));
    }
  }

  get current(): string | undefined {
    return this.order[this.pos];
  }

  toggleShuffle(): boolean {
    this.shuffle = !this.shuffle;
    if (this.order.length && this.current !== undefined) this.build(this.current);
    return this.shuffle;
  }

  cycleRepeat(): RepeatMode {
    const nextMode: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
    this.repeat = nextMode[this.repeat];
    return this.repeat;
  }

  // auto = true quando a música acabou sozinha
  next(auto = false): string | null {
    if (!this.order.length) return null;
    if (auto && this.repeat === 'one') return this.current ?? null;
    if (this.pos < this.order.length - 1) {
      this.pos++;
      return this.current ?? null;
    }
    if (this.repeat === 'all') {
      this.pos = 0;
      return this.current ?? null;
    }
    return null; // fim da fila: para
  }

  // passou de 3 segundos? reinicia a atual em vez de voltar
  prev(seconds = 0): string | null {
    if (!this.order.length) return null;
    if (seconds > 3 || this.pos === 0) return this.current ?? null;
    this.pos--;
    return this.current ?? null;
  }

  randomJump(): string | null {
    if (!this.order.length) return null;
    if (this.order.length > 1) {
      let p: number;
      do {
        p = Math.floor(Math.random() * this.order.length);
      } while (p === this.pos);
      this.pos = p;
    }
    return this.current ?? null;
  }
}