import { allMusicas, deleteMusica, putMusicas, type MusicaSalva } from './db';
import type { Track } from './library';

const EXT = /\.(mp3|mp4|m4a|wav|ogg|flac|aac)$/i;

function paraTrack(r: MusicaSalva): Track {
  const file = r.file instanceof File ? r.file : new File([r.file], r.path, { type: r.file.type });
  return { id: r.id, title: r.title, path: r.path, file };
}

export async function carregarSalvas(): Promise<Track[]> {
  const rows = await allMusicas();
  return rows.map(paraTrack).sort((a, b) => a.title.localeCompare(b.title));
}

export async function adicionarArquivos(files: File[]): Promise<number> {
  const validos = files.filter((f) => EXT.test(f.name) || f.type.startsWith('audio/'));
  const rows: MusicaSalva[] = validos.map((f) => ({
    id: f.name + '|' + f.size,
    title: f.name.replace(/\.[^.]+$/, ''),
    path: f.name,
    file: f,
  }));
  if (rows.length) await putMusicas(rows);
  return rows.length;
}

export async function removerSalva(id: string) {
  await deleteMusica(id);
}

export async function usoDeEspaco(): Promise<string> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e?.usage) return '';
    return Math.round(e.usage / 1048576) + ' MB';
  } catch {
    return '';
  }
}

// Pede ao navegador para não apagar as músicas salvas quando faltar espaço
export function pedirPersistencia() {
  navigator.storage?.persist?.().catch(() => {});
}
