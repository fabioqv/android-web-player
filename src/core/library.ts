export interface Track {
  id: string;
  title: string;
  path: string;
  file: File;
}

const EXT = /\.(mp3|mp4|m4a|wav|ogg|flac|aac)$/i;

// dir é um FileSystemDirectoryHandle (tipado como any por compatibilidade)
export async function scanFolder(dir: any, prefix = ''): Promise<Track[]> {
  const out: Track[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      out.push(...(await scanFolder(handle, prefix + name + '/')));
    } else if (EXT.test(name)) {
      const file: File = await handle.getFile();
      out.push({
        id: prefix + name + '|' + file.size,
        title: name.replace(/\.[^.]+$/, ''),
        path: prefix + name,
        file,
      });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function hasPermission(
  handle: any,
  ask: boolean
): Promise<boolean> {
  const opts = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (ask && (await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}
