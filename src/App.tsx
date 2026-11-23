import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { loadKV, saveKV } from './core/db';
import { scanFolder, hasPermission, type Track } from './core/library';
import { PlayQueue, type RepeatMode } from './core/PlayQueue';
import { PlaylistStore } from './core/PlaylistStore';
import { lerMeta, type Meta } from './core/metadata';

type Status =
  | 'carregando'
  | 'sem-pasta'
  | 'reautorizar'
  | 'varrendo'
  | 'pronto'
  | 'sem-suporte';

const P = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  next: 'M6 18l8.5-6L6 6zm10-12h2v12h-2z',
  prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  shuffle:
    'M10.6 9.2L5.4 4 4 5.4l5.2 5.2zM14.5 4l2.5 2.5L4 19.6 5.4 21 18.5 7.9 21 10.5V4zm.3 9.4l-1.4 1.4 3.6 3.6L14.5 21H21v-6.5l-2.5 2.5z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  dice: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm3 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  x: 'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  vol: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.5 4.5 0 0016.5 12z',
  add: 'M14 10H3v2h11zm0-4H3v2h11zM3 16h7v-2H3zm13-4v3h-3v2h3v3h2v-3h3v-2h-3v-3z',
};
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const fmt = (s: number) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const rotuloRepetir: Record<RepeatMode, string> = {
  off: 'Repetir: desligado',
  all: 'Repetir: tudo',
  one: 'Repetir: uma música',
};

export default function App() {
  // ---- biblioteca ----
  const [status, setStatus] = useState<Status>('carregando');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [pasta, setPasta] = useState('');
  const [erro, setErro] = useState('');

  // ---- player ----
  const queue = useRef(new PlayQueue()).current;
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef('');
  const [atualId, setAtualId] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [aleatorio, setAleatorio] = useState(false);
  const [repetir, setRepetir] = useState<RepeatMode>('off');

  // ---- playlists ----
  const store = useRef(new PlaylistStore()).current;
  const [, forcar] = useState(0);
  const atualizar = () => forcar((n) => n + 1);
  const [aba, setAba] = useState<'biblioteca' | 'playlists'>('biblioteca');
  const [plAberta, setPlAberta] = useState<string | null>(null);
  const [menuAdd, setMenuAdd] = useState<string | null>(null);
  const [nomeNovaPl, setNomeNovaPl] = useState('');
  const [nomeMenu, setNomeMenu] = useState('');

  // ---- informações lidas dos arquivos (título, artista, capa) ----
  const [metas, setMetas] = useState<Record<string, Meta>>({});
  const titulo = (t: Track) => metas[t.id]?.title || t.title;
  const artista = (t: Track) => metas[t.id]?.artist || '';

  useEffect(() => {
    let cancelado = false;
    (async () => {
      for (const t of tracks) {
        if (cancelado) return;
        const m = await lerMeta(t.file);
        if (m.title || m.artist || m.cover)
          setMetas((prev) => ({ ...prev, [t.id]: m }));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tracks]);

  const porId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const atual = atualId ? porId.get(atualId) : undefined;
  const capa = atual ? metas[atual.id]?.cover : undefined;

  async function varrer(handle: any) {
    setStatus('varrendo');
    setPasta(handle.name);
    setTracks(await scanFolder(handle));
    setStatus('pronto');
  }

  useEffect(() => {
    (async () => {
      if (!('showDirectoryPicker' in window)) return setStatus('sem-suporte');
      const handle = await loadKV<any>('pasta');
      if (!handle) return setStatus('sem-pasta');
      setPasta(handle.name);
      if (await hasPermission(handle, false)) await varrer(handle);
      else setStatus('reautorizar');
    })().catch((e) => {
      setErro(String(e));
      setStatus('sem-pasta');
    });
  }, []);

  async function escolherPasta() {
    try {
      setErro('');
      const handle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });
      await saveKV('pasta', handle);
      await varrer(handle);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErro(String(e));
      setStatus(tracks.length ? 'pronto' : 'sem-pasta');
    }
  }

  async function reautorizar() {
    const handle = await loadKV<any>('pasta');
    if (handle && (await hasPermission(handle, true))) await varrer(handle);
  }

  // ---- controles do player ----
  function tocar(id: string | null) {
    const a = audioRef.current!;
    if (id == null) {
      a.pause();
      a.currentTime = 0;
      return;
    }
    const t = porId.get(id);
    if (!t) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(t.file);
    a.src = urlRef.current;
    a.play().catch(() => setErro('Não foi possível tocar este arquivo.'));
    setAtualId(id);
  }

  function idsDaFila(daPlaylist?: string): string[] {
    if (daPlaylist)
      return store
        .tracks(daPlaylist)
        .map((i) => i.id)
        .filter((id) => porId.has(id));
    return tracks.map((t) => t.id);
  }

  function iniciarDe(id: string, daPlaylist?: string) {
    queue.set(idsDaFila(daPlaylist), id);
    tocar(queue.current ?? null);
  }

  function tocarPlaylist(nome: string) {
    const ids = idsDaFila(nome);
    if (!ids.length) return;
    queue.set(ids);
    tocar(queue.current ?? null);
  }

  function playPause() {
    const a = audioRef.current!;
    if (!atualId) {
      if (tracks.length) iniciarDe(tracks[0].id);
      return;
    }
    if (a.paused) a.play();
    else a.pause();
  }

  function proxima() {
    tocar(queue.next(false));
  }
  function anterior() {
    const a = audioRef.current!;
    if (a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    tocar(queue.prev(0));
  }
  function aleatoria() {
    if (!queue.order.length) queue.set(tracks.map((t) => t.id));
    tocar(queue.randomJump());
  }
  function alternarAleatorio() {
    setAleatorio(queue.toggleShuffle());
  }
  function alternarRepetir() {
    setRepetir(queue.cycleRepeat());
  }
  function aoTerminar() {
    tocar(queue.next(true));
  }

  // ---- ações de playlist ----
  function criarPlaylist() {
    const n = store.create(nomeNovaPl);
    if (n) {
      setPlAberta(n);
      setNomeNovaPl('');
      atualizar();
    }
  }
  function adicionarA(nome: string, t: Track) {
    store.add(nome, { id: t.id, title: titulo(t) });
    setMenuAdd(null);
    atualizar();
  }
  function criarEAdicionar(t: Track) {
    const n = store.create(nomeMenu);
    if (n) {
      store.add(n, { id: t.id, title: titulo(t) });
      setNomeMenu('');
      setMenuAdd(null);
      atualizar();
    }
  }

  // ---- uma linha de música ----
  const linha = (t: Track, daPlaylist?: string) => (
    <li key={t.id}>
      <div className={'row' + (t.id === atualId ? ' cur' : '')}>
        <button className="main" onClick={() => iniciarDe(t.id, daPlaylist)}>
          <div className="t">{titulo(t)}</div>
          <div className="a">{artista(t) || 'Artista desconhecido'}</div>
        </button>
        <button
          className="ic"
          title="Adicionar à playlist"
          aria-label="Adicionar à playlist"
          onClick={() => {
            setNomeMenu('');
            setMenuAdd(menuAdd === t.id ? null : t.id);
          }}
        >
          <Icon d={P.add} />
        </button>
        {daPlaylist && (
          <button
            className="ic"
            title="Tirar da playlist"
            aria-label="Tirar da playlist"
            onClick={() => {
              store.removeTrack(daPlaylist, t.id);
              atualizar();
            }}
          >
            <Icon d={P.x} />
          </button>
        )}
      </div>

      {menuAdd === t.id && (
        <div className="menu">
          <b>Adicionar a:</b>
          <div className="chips">
            {store.names().length === 0 && (
              <span className="vazio" style={{ padding: 0 }}>
                Nenhuma playlist ainda. Crie uma abaixo.
              </span>
            )}
            {store.names().map((n) => {
              const jaTem = store.tracks(n).some((x) => x.id === t.id);
              return (
                <button
                  key={n}
                  className="chip"
                  disabled={jaTem}
                  onClick={() => adicionarA(n, t)}
                >
                  {jaTem ? '✓ ' : ''}
                  {n}
                </button>
              );
            })}
          </div>
          <div className="bar" style={{ marginBottom: 0 }}>
            <input
              type="text"
              placeholder="Nova playlist"
              maxLength={40}
              value={nomeMenu}
              onChange={(e) => setNomeMenu(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') criarEAdicionar(t);
              }}
            />
            <button className="btn small" onClick={() => criarEAdicionar(t)}>
              Criar e adicionar
            </button>
          </div>
        </div>
      )}
    </li>
  );

  const nomes = store.names();
  const itensAbertos = plAberta ? store.tracks(plAberta) : [];

  // ---- telas de estado (antes de a biblioteca estar pronta) ----
  if (status !== 'pronto') {
    return (
      <main className="app">
        <div className="aviso">
          <h1>Meu Player</h1>
          {status === 'sem-suporte' && (
            <p>
              Este navegador não permite acessar pastas. Use o Chrome ou o Edge
              no computador.
            </p>
          )}
          {status === 'carregando' && <p>Carregando…</p>}
          {status === 'varrendo' && <p>Procurando músicas em “{pasta}”…</p>}
          {status === 'sem-pasta' && (
            <button className="btn" onClick={escolherPasta}>
              Escolher pasta de músicas
            </button>
          )}
          {status === 'reautorizar' && (
            <button className="btn" onClick={reautorizar}>
              Reabrir a pasta “{pasta}”
            </button>
          )}
        </div>
        {erro && <p className="erro">{erro}</p>}
      </main>
    );
  }

  return (
    <main className="app">
      {/* ---------- Tocando agora ---------- */}
      <section className="now" aria-label="Tocando agora">
        <div className={'disc' + (tocando ? ' on' : '')}>
          <div
            className="label"
            style={capa ? { backgroundImage: `url("${capa}")` } : undefined}
          />
        </div>
        <h2>{atual ? titulo(atual) : 'Nenhuma música tocando'}</h2>
        <p className="artista">
          {atual
            ? artista(atual) || 'Artista desconhecido'
            : 'Escolha uma música da lista'}
        </p>

        <div className="seek">
          <span>{fmt(posicao)}</span>
          <input
            type="range"
            min={0}
            max={duracao || 0}
            step={0.1}
            value={posicao}
            aria-label="Posição da música"
            onChange={(e) => {
              audioRef.current!.currentTime = Number(e.target.value);
            }}
          />
          <span>{fmt(duracao)}</span>
        </div>

        <div className="ctrl">
          <button
            className={aleatorio ? 'on' : ''}
            title="Aleatório (embaralhar fila)"
            aria-pressed={aleatorio}
            onClick={alternarAleatorio}
          >
            <Icon d={P.shuffle} />
          </button>
          <button title="Anterior" onClick={anterior}>
            <Icon d={P.prev} />
          </button>
          <button className="play" title="Tocar / pausar" onClick={playPause}>
            <Icon d={tocando ? P.pause : P.play} />
          </button>
          <button title="Próxima" onClick={proxima}>
            <Icon d={P.next} />
          </button>
          <button
            className={repetir !== 'off' ? 'on' : ''}
            title={rotuloRepetir[repetir]}
            onClick={alternarRepetir}
          >
            <Icon d={P.repeat} />
            {repetir === 'one' && <span className="badge">1</span>}
          </button>
        </div>
        <div className="ctrl">
          <button
            className="jump"
            title="Pular para uma música aleatória"
            onClick={aleatoria}
          >
            <Icon d={P.dice} /> Aleatória
          </button>
        </div>

        <div className="vol">
          <Icon d={P.vol} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={1}
            aria-label="Volume"
            onChange={(e) => {
              audioRef.current!.volume = Number(e.target.value);
            }}
          />
        </div>

        <audio
          ref={audioRef}
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
          onEnded={aoTerminar}
          onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
          onError={() => setErro('Não foi possível tocar este arquivo.')}
        />
      </section>

      {/* ---------- Listas ---------- */}
      <section aria-label="Músicas">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={aba === 'biblioteca'}
            onClick={() => setAba('biblioteca')}
          >
            Biblioteca
          </button>
          <button
            role="tab"
            aria-selected={aba === 'playlists'}
            onClick={() => setAba('playlists')}
          >
            Playlists
          </button>
        </div>

        {aba === 'biblioteca' && (
          <>
            <div className="resumo">
              <span>
                <b>{tracks.length}</b> músicas em “{pasta}”
              </span>
              <button className="btn alt small" onClick={escolherPasta}>
                Trocar pasta
              </button>
            </div>
            <ul className="lista">{tracks.map((t) => linha(t))}</ul>
          </>
        )}

        {aba === 'playlists' && (
          <>
            <div className="bar">
              <input
                type="text"
                placeholder="Nome da nova playlist"
                maxLength={40}
                value={nomeNovaPl}
                onChange={(e) => setNomeNovaPl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') criarPlaylist();
                }}
              />
              <button className="btn" onClick={criarPlaylist}>
                Criar playlist
              </button>
            </div>

            {nomes.length === 0 && (
              <p className="vazio">
                Nenhuma playlist ainda. Crie uma e adicione músicas pelo botão
                de adicionar na Biblioteca.
              </p>
            )}

            <div className="chips">
              {nomes.map((n) => (
                <button
                  key={n}
                  className="chip"
                  aria-pressed={n === plAberta}
                  onClick={() => setPlAberta(n)}
                >
                  {n} ({store.tracks(n).length})
                </button>
              ))}
            </div>

            {plAberta && nomes.includes(plAberta) && (
              <>
                <div className="bar">
                  <button
                    className="btn"
                    disabled={!itensAbertos.some((i) => porId.has(i.id))}
                    onClick={() => tocarPlaylist(plAberta)}
                  >
                    Tocar playlist
                  </button>
                  <button
                    className="btn alt"
                    onClick={() => {
                      store.remove(plAberta);
                      setPlAberta(null);
                      atualizar();
                    }}
                  >
                    Excluir playlist
                  </button>
                </div>

                {itensAbertos.length === 0 && (
                  <p className="vazio">Esta playlist está vazia.</p>
                )}
                <ul className="lista">
                  {itensAbertos.map((i) => {
                    const t = porId.get(i.id);
                    if (t) return linha(t, plAberta);
                    return (
                      <li key={i.id}>
                        <div className="row miss">
                          <div className="main">
                            <div className="t">{i.title}</div>
                            <div className="a">
                              Arquivo não encontrado na pasta
                            </div>
                          </div>
                          <button
                            className="ic"
                            title="Tirar da playlist"
                            aria-label="Tirar da playlist"
                            onClick={() => {
                              store.removeTrack(plAberta, i.id);
                              atualizar();
                            }}
                          >
                            <Icon d={P.x} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {erro && <p className="erro">{erro}</p>}
    </main>
  );
}
