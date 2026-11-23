import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export interface Meta {
  title?: string;
  artist?: string;
  album?: string;
  cover?: string; // endereço temporário da imagem
}

export function lerMeta(file: File): Promise<Meta> {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag: any) => {
        const t = tag.tags ?? {};
        let cover: string | undefined;
        if (t.picture) {
          const blob = new Blob([new Uint8Array(t.picture.data)], { type: t.picture.format });
          cover = URL.createObjectURL(blob);
        }
        resolve({ title: t.title, artist: t.artist, album: t.album, cover });
      },
      onError: () => resolve({}), // sem informações: segue com o nome do arquivo
    });
  });
}