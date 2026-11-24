import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import './App.css';
import { loadKV, saveKV } from './core/db';
import { scanFolder, hasPermission, type Track } from './core/library';
import { adicionarArquivos, carregarSalvas, pedirPersistencia, removerSalva, usoDeEspaco } from './core/local';
import { PlayQueue, type RepeatMode } from './core/PlayQueue';
import { PlaylistStore } from './core/PlaylistStore';
import { lerMeta, type Meta } from './core/metadata';

type Status = 'carregando' | 'sem-pasta' | 'reautorizar' | 'varrendo' | 'pronto';

// Chrome/Edge no computador acham as músicas pela pasta. Os demais usam arquivos salvos no app.
const MODO_PASTA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// Telas até esta largura usam o modo "celular" (duas páginas: lista e player).
// Precisa ser igual ao 760px do App.css.
const QUERY_CELULAR = '(max-width: 760px)';

// Desenhos dos ícones (SVG)
const P = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  next: 'M6 18l8.5-6L6 6zm10-12h2v12h-2z',
  prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  shuffle: 'M10.6 9.2L5.4 4 4 5.4l5.2 5.2zM14.5 4l2.5 2.5L4 19.6 5.4 21 18.5 7.9 21 10.5V4zm.3 9.4l-1.4 1.4 3.6 3.6L14.5 21H21v-6.5l-2.5 2.5z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  dice: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm3 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  x: 'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  vol: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.5 4.5 0 0016.5 12z',
  add: 'M14 10H3v2h11zm0-4H3v2h11zM3 16h7v-2H3zm13-4v3h-3v2h3v3h2v-3h3v-2h-3v-3z',
  trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
};
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
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

// Busca: ignora acentos e maiúsculas ("cafe" encontra "Café")
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Comparação de artistas (mais leve que a busca)
const chave = (s: string) => s.trim().toLowerCase();

export default function App() {
  // ---- biblioteca ----
  const [status, setStatus] = useState<Status>('carregando');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [pasta, setPasta] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [uso, setUso] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ---- navegação do celular (duas páginas: "lista" e "player") ----
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY_CELULAR).matches);
  const [tela, setTela] = useState<'lista' | 'player'>('lista');
  const scrollRef = useRef(0); // lembra onde a lista estava para voltar no mesmo ponto

  // ---- busca e seleção de várias músicas ----
  const [busca, setBusca] = useState('');
  const [modoAdd, setModoAdd] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);

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
        if (m.title || m.artist || m.cover) setMetas((prev) => ({ ...prev, [t.id]: m }));
      }
    })();
    return () => { cancelado = true; };
  }, [tracks]);

  const porId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const atual = atualId ? porId.get(atualId) : undefined;
  const capa = atual ? metas[atual.id]?.cover : undefined;

  // Músicas da biblioteca que combinam com a busca (sem busca, todas)
  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return tracks;
    return tracks.filter((t) => norm(`${titulo(t)} ${artista(t)}`).includes(q));
  }, [tracks, metas, busca]);

  // Recomendações: outras músicas do mesmo artista da que está tocando
  const recomendadas = useMemo(() => {
    if (!atual) return [] as Track[];
    const nome = chave(artista(atual));
    if (!nome) return [] as Track[];
    return tracks.filter((t) => t.id !== atual.id && chave(artista(t)) === nome);
  }, [tracks, metas, atualId]);

  // ---- celular: detectar tela estreita, botão voltar e posição da rolagem ----
  useEffect(() => {
    const mq = window.matchMedia(QUERY_CELULAR);
    const aoMudar = () => setMobile(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  useEffect(() => {
    // botão "voltar" do Android (ou gesto de voltar): fecha o player em vez de sair do app
    const aoVoltar = () => setTela('lista');
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    window.scrollTo(0, tela === 'player' ? 0 : scrollRef.current);
  }, [tela, mobile]);

  function abrirPlayer() {
    if (!mobile || tela === 'player') return;
    scrollRef.current = window.scrollY;
    window.history.pushState({ player: true }, '');
    setTela('player');
  }

  function voltar() {
    if (window.history.state?.player) window.history.back();
    else setTela('lista');
  }

  async function atualizarUso() {
    setUso(await usoDeEspaco());
  }

  async function varrer(handle: any) {
    setStatus('varrendo');
    setPasta(handle.name);
    setTracks(await scanFolder(handle));
    setStatus('pronto');
  }

  // Ao abrir o app
  useEffect(() => {
    (async () => {
      if (!MODO_PASTA) {
        setTracks(await carregarSalvas());
        setStatus('pronto');
        atualizarUso();
        return;
      }
      const handle = await loadKV<any>('pasta');
      if (!handle) return setStatus('sem-pasta');
      setPasta(handle.name);
      if (await hasPermission(handle, false)) await varrer(handle);
      else setStatus('reautorizar');
    })().catch((e) => { setErro(String(e)); setStatus(MODO_PASTA ? 'sem-pasta' : 'pronto'); });
  }, []);

  // ---- modo computador: pasta ----
  async function escolherPasta() {
    try {
      setErro('');
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
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

  // ---- modo celular: arquivos salvos no app ----
  async function aoEscolherArquivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!lista.length) return;
    try {
      setErro('');
      setOcupado(`Salvando ${lista.length} arquivo(s)…`);
      pedirPersistencia();
      await adicionarArquivos(lista);
      setTracks(await carregarSalvas());
      atualizarUso();
    } catch {
      setErro('Não foi possível salvar. O aparelho pode estar sem espaço.');
    } finally {
      setOcupado('');
    }
  }

  async function removerMusica(t: Track) {
    if (!window.confirm(`Remover “${titulo(t)}” do app?`)) return;
    if (t.id === atualId) { tocar(null); setAtualId(null); }
    await removerSalva(t.id);
    setTracks((prev) => prev.filter((x) => x.id !== t.id));
    atualizarUso();
  }

  // ---- controles do player ----
  function tocar(id: string | null) {
    const a = audioRef.current!;
    if (id == null) { a.pause(); a.currentTime = 0; return; }
    const t = porId.get(id);
    if (!t) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(t.file);
    a.src = urlRef.current;
    a.play().catch(() => setErro('Não foi possível tocar este arquivo.'));
    setAtualId(id);
  }

  // Toca uma música usando "ids" como fila (a lista que está na tela).
  // No celular, abre a página do player.
  function iniciarDe(id: string, ids: string[]) {
    queue.set(ids.filter((i) => porId.has(i)), id);
    tocar(queue.current ?? null);
    abrirPlayer();
  }

  const idsDaPlaylist = (nome: string) =>
    store.tracks(nome).map((i) => i.id).filter((id) => porId.has(id));

  function tocarPlaylist(nome: string) {
    const ids = idsDaPlaylist(nome);
    if (!ids.length) return;
    queue.set(ids);
    tocar(queue.current ?? null);
    abrirPlayer();
  }

  function playPause() {
    const a = audioRef.current!;
    if (!atualId) {
      if (tracks.length) iniciarDe(tracks[0].id, tracks.map((t) => t.id));
      return;
    }
    if (a.paused) a.play(); else a.pause();
  }

  function proxima() { tocar(queue.next(false)); }
  function anterior() {
    const a = audioRef.current!;
    if (a.currentTime > 3) { a.currentTime = 0; return; }
    tocar(queue.prev(0));
  }
  function aleatoria() {
    if (!queue.order.length) queue.set(tracks.map((t) => t.id));
    tocar(queue.randomJump());
  }
  function alternarAleatorio() { setAleatorio(queue.toggleShuffle()); }
  function alternarRepetir() { setRepetir(queue.cycleRepeat()); }
  function aoTerminar() { tocar(queue.next(true)); }

  // ---- ações de playlist ----
  function criarPlaylist() {
    const n = store.create(nomeNovaPl);
    if (n) { setPlAberta(n); setNomeNovaPl(''); atualizar(); }
  }
  function adicionarA(nome: string, t: Track) {
    store.add(nome, { id: t.id, title: titulo(t) });
    setMenuAdd(null);
    atualizar();
  }
  function criarEAdicionar(t: Track) {
    const n = store.create(nomeMenu);
    if (n) { store.add(n, { id: t.id, title: titulo(t) }); setNomeMenu(''); setMenuAdd(null); atualizar(); }
  }

  // ---- seleção de várias músicas para uma playlist ----
  function alternarMarca(id: string) {
    setMarcadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function sairModoAdd() { setModoAdd(false); setMarcadas([]); }
  function confirmarAdd() {
    if (!plAberta) return;
    marcadas.forEach((id) => {
      const t = porId.get(id);
      if (t) store.add(plAberta, { id: t.id, title: titulo(t) });
    });
    setMarcadas([]);
    setModoAdd(false);
    setBusca('');
    atualizar();
  }
  function abrirPlaylist(nome: string) { setPlAberta(nome); sairModoAdd(); }
  function mudarAba(a: 'biblioteca' | 'playlists') { setAba(a); sairModoAdd(); }

  // ---- uma linha de música (biblioteca e playlist) ----
  const linha = (t: Track, ids: string[], daPlaylist?: string) => (
    <li key={t.id}>
      <div className={'row' + (t.id === atualId ? ' cur' : '')}>
        <button className="main" onClick={() => iniciarDe(t.id, ids)}>
          <div className="t">{titulo(t)}</div>
          <div className="a">{artista(t) || 'Artista desconhecido'}</div>
        </button>
        <button className="ic" title="Adicionar à playlist" aria-label="Adicionar à playlist"
          onClick={() => { setNomeMenu(''); setMenuAdd(menuAdd === t.id ? null : t.id); }}>
          <Icon d={P.add} />
        </button>
        {daPlaylist && (
          <button className="ic" title="Tirar da playlist" aria-label="Tirar da playlist"
            onClick={() => { store.removeTrack(daPlaylist, t.id); atualizar(); }}>
            <Icon d={P.x} />
          </button>
        )}
        {!MODO_PASTA && !daPlaylist && (
          <button className="ic" title="Remover do app" aria-label="Remover do app" onClick={() => removerMusica(t)}>
            <Icon d={P.trash} />
          </button>
        )}
      </div>

      {menuAdd === t.id && (
        <div className="menu">
          <b>Adicionar a:</b>
          <div className="chips">
            {store.names().length === 0 && <span className="vazio" style={{ padding: 0 }}>Nenhuma playlist ainda. Crie uma abaixo.</span>}
            {store.names().map((n) => {
              const jaTem = store.tracks(n).some((x) => x.id === t.id);
              return (
                <button key={n} className="chip" disabled={jaTem} onClick={() => adicionarA(n, t)}>
                  {jaTem ? '✓ ' : ''}{n}
                </button>
              );
            })}
          </div>
          <div className="bar" style={{ marginBottom: 0 }}>
            <input type="text" placeholder="Nova playlist" maxLength={40} value={nomeMenu}
              onChange={(e) => setNomeMenu(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') criarEAdicionar(t); }} />
            <button className="btn small" onClick={() => criarEAdicionar(t)}>Criar e adicionar</button>
          </div>
        </div>
      )}
    </li>
  );

  // ---- uma linha no modo "marcar várias músicas" ----
  const linhaSel = (t: Track, jaNa: boolean) => {
    const marcada = marcadas.includes(t.id);
    return (
      <li key={t.id}>
        <button
          className={'row sel' + (marcada ? ' marcada' : '')}
          disabled={jaNa}
          aria-pressed={marcada}
          onClick={() => alternarMarca(t.id)}
        >
          <span className="caixa">{(marcada || jaNa) && <Icon d={P.check} />}</span>
          <div className="info">
            <div className="t">{titulo(t)}</div>
            <div className="a">{jaNa ? 'Já está na playlist' : artista(t) || 'Artista desconhecido'}</div>
          </div>
        </button>
      </li>
    );
  };

  // ---- bloco "Mais de [artista]" (aparece no lado esquerdo no PC e na lista no celular) ----
  const recBloco = (cls: string) => {
    if (!atual || !recomendadas.length) return null;
    const base = atual;
    const idsRec = [base.id, ...recomendadas.map((x) => x.id)];
    return (
      <section className={'rec ' + cls} aria-label="Recomendações do mesmo artista">
        <h3>Mais de {artista(base)}</h3>
        <ul className="rec-itens">
          {recomendadas.slice(0, 12).map((t) => (
            <li key={t.id}>
              <div className="row">
                <button className="main" onClick={() => iniciarDe(t.id, idsRec)}>
                  <div className="t">{titulo(t)}</div>
                  <div className="a">{artista(t)}</div>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  // ---- dados que as telas usam ----
  const nomes = store.names();
  const itensAbertos = plAberta ? store.tracks(plAberta) : [];
  const jaNaPl = new Set(itensAbertos.map((i) => i.id));
  const q = norm(busca.trim());
  const itensVisiveis = itensAbertos.filter((i) => {
    if (!q) return true;
    const t = porId.get(i.id);
    return norm(t ? `${titulo(t)} ${artista(t)}` : i.title).includes(q);
  });
  const idsPlVisiveis = itensVisiveis.filter((i) => porId.has(i.id)).map((i) => i.id);
  const idsBiblioteca = visiveis.map((t) => t.id);
  const mostrarMini = mobile && tela === 'lista' && !!atual && !modoAdd;

  // ---- telas de estado (antes de a biblioteca estar pronta) ----
  if (status !== 'pronto') {
    return (
      <main className="app">
        <div className="aviso">
          <h1>Meu Player</h1>
          {status === 'carregando' && <p>Carregando…</p>}
          {status === 'varrendo' && <p>Procurando músicas em “{pasta}”…</p>}
          {status === 'sem-pasta' && <button className="btn" onClick={escolherPasta}>Escolher pasta de músicas</button>}
          {status === 'reautorizar' && <button className="btn" onClick={reautorizar}>Reabrir a pasta “{pasta}”</button>}
        </div>
        {erro && <p className="erro">{erro}</p>}
      </main>
    );
  }

  return (
    <main className={'app' + (mobile ? ' m-' + tela : '') + (mostrarMini ? ' tem-mini' : '')}>
      <input
        ref={inputRef} type="file" multiple style={{ display: 'none' }}
        accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg,.flac,.aac"
        onChange={aoEscolherArquivos}
      />

      {/* O áudio fica fora das colunas para continuar tocando quando o player some da tela */}
      <audio
        ref={audioRef}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={aoTerminar}
        onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onError={() => setErro('Não foi possível tocar este arquivo.')}
      />

      {/* ---------- COLUNA ESQUERDA: player + recomendações ---------- */}
      <aside className="esq">
        <section className="now" aria-label="Tocando agora">
          {/* Só aparece na página do player do celular */}
          <div className="topo-player">
            <button className="voltar" onClick={voltar} title="Voltar para a lista" aria-label="Voltar para a lista">
              <Icon d={P.back} />
            </button>
            <span className="topo-tit">Tocando agora</span>
          </div>

          <div className={'disc' + (tocando ? ' on' : '')}>
            <div className="label" style={capa ? { backgroundImage: `url("${capa}")` } : undefined} />
          </div>
          <h2>{atual ? titulo(atual) : 'Nenhuma música tocando'}</h2>
          <p className="artista">
            {atual ? artista(atual) || 'Artista desconhecido' : 'Escolha uma música da lista'}
          </p>

          <div className="seek">
            <span>{fmt(posicao)}</span>
            <input type="range" min={0} max={duracao || 0} step={0.1} value={posicao}
              aria-label="Posição da música"
              onChange={(e) => { audioRef.current!.currentTime = Number(e.target.value); }} />
            <span>{fmt(duracao)}</span>
          </div>

          <div className="ctrl">
            <button className={aleatorio ? 'on' : ''} title="Aleatório (embaralhar fila)" aria-pressed={aleatorio} onClick={alternarAleatorio}>
              <Icon d={P.shuffle} />
            </button>
            <button title="Anterior" onClick={anterior}><Icon d={P.prev} /></button>
            <button className="play" title="Tocar / pausar" onClick={playPause}>
              <Icon d={tocando ? P.pause : P.play} />
            </button>
            <button title="Próxima" onClick={proxima}><Icon d={P.next} /></button>
            <button className={repetir !== 'off' ? 'on' : ''} title={rotuloRepetir[repetir]} onClick={alternarRepetir}>
              <Icon d={P.repeat} />
              {repetir === 'one' && <span className="badge">1</span>}
            </button>
          </div>
          <div className="ctrl">
            <button className="jump" title="Pular para uma música aleatória" onClick={aleatoria}>
              <Icon d={P.dice} /> Aleatória
            </button>
          </div>

          <div className="vol">
            <Icon d={P.vol} />
            <input type="range" min={0} max={1} step={0.01} defaultValue={1} aria-label="Volume"
              onChange={(e) => { audioRef.current!.volume = Number(e.target.value); }} />
          </div>
        </section>

        {recBloco('rec-esq')}
      </aside>

      {/* ---------- COLUNA DIREITA: busca, abas e listas ---------- */}
      <section className="col-dir" aria-label="Músicas">
        <div className="busca">
          <Icon d={P.search} />
          <input
            type="search" placeholder="Buscar música ou artista" value={busca}
            aria-label="Buscar música ou artista"
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button className="limpar" onClick={() => setBusca('')} title="Limpar busca" aria-label="Limpar busca">
              <Icon d={P.x} />
            </button>
          )}
        </div>

        {recBloco('rec-dir')}

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={aba === 'biblioteca'} onClick={() => mudarAba('biblioteca')}>Biblioteca</button>
          <button role="tab" aria-selected={aba === 'playlists'} onClick={() => mudarAba('playlists')}>Playlists</button>
        </div>

        {/* ---- BIBLIOTECA ---- */}
        {aba === 'biblioteca' && (
          <>
            {MODO_PASTA ? (
              <div className="resumo">
                <span>
                  <b>{busca ? `${visiveis.length} de ${tracks.length}` : tracks.length}</b> músicas em “{pasta}”
                </span>
                <button className="btn alt small" onClick={escolherPasta}>Trocar pasta</button>
              </div>
            ) : (
              <div className="resumo">
                <span>
                  <b>{busca ? `${visiveis.length} de ${tracks.length}` : tracks.length}</b> músicas salvas no app{uso ? ` · ${uso} usados` : ''}
                </span>
                <button className="btn small" disabled={!!ocupado} onClick={() => inputRef.current?.click()}>
                  Adicionar músicas
                </button>
              </div>
            )}
            {ocupado && <p className="vazio">{ocupado}</p>}
            {!MODO_PASTA && tracks.length === 0 && !ocupado && (
              <p className="vazio">
                Nenhuma música ainda. Toque em “Adicionar músicas” e escolha os arquivos do aparelho. Eles ficam salvos no app.
              </p>
            )}
            {busca && visiveis.length === 0 && tracks.length > 0 && (
              <p className="vazio">Nenhuma música encontrada para “{busca}”.</p>
            )}
            <ul className="lista">{visiveis.map((t) => linha(t, idsBiblioteca))}</ul>
          </>
        )}

        {/* ---- PLAYLISTS ---- */}
        {aba === 'playlists' && (
          <>
            <div className="bar">
              <input type="text" placeholder="Nome da nova playlist" maxLength={40} value={nomeNovaPl}
                onChange={(e) => setNomeNovaPl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') criarPlaylist(); }} />
              <button className="btn" onClick={criarPlaylist}>Criar playlist</button>
            </div>

            {nomes.length === 0 && (
              <p className="vazio">Nenhuma playlist ainda. Crie uma e adicione músicas.</p>
            )}

            <div className="chips">
              {nomes.map((n) => (
                <button key={n} className="chip" aria-pressed={n === plAberta} onClick={() => abrirPlaylist(n)}>
                  {n} ({store.tracks(n).length})
                </button>
              ))}
            </div>

            {plAberta && nomes.includes(plAberta) && !modoAdd && (
              <>
                <div className="bar">
                  <button className="btn" disabled={!idsDaPlaylist(plAberta).length} onClick={() => tocarPlaylist(plAberta)}>
                    Tocar playlist
                  </button>
                  <button className="btn alt" disabled={!tracks.length} onClick={() => { setModoAdd(true); setMarcadas([]); }}>
                    Adicionar músicas
                  </button>
                  <button className="btn alt" onClick={() => { store.remove(plAberta); setPlAberta(null); sairModoAdd(); atualizar(); }}>
                    Excluir playlist
                  </button>
                </div>

                {itensAbertos.length === 0 && <p className="vazio">Esta playlist está vazia. Use “Adicionar músicas”.</p>}
                {busca && itensAbertos.length > 0 && itensVisiveis.length === 0 && (
                  <p className="vazio">Nenhuma música da playlist encontrada para “{busca}”.</p>
                )}
                <ul className="lista">
                  {itensVisiveis.map((i) => {
                    const t = porId.get(i.id);
                    if (t) return linha(t, idsPlVisiveis, plAberta);
                    return (
                      <li key={i.id}>
                        <div className="row miss">
                          <div className="main">
                            <div className="t">{i.title}</div>
                            <div className="a">Arquivo não encontrado no app</div>
                          </div>
                          <button className="ic" title="Tirar da playlist" aria-label="Tirar da playlist"
                            onClick={() => { store.removeTrack(plAberta, i.id); atualizar(); }}>
                            <Icon d={P.x} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* Modo: marcar várias músicas e adicionar de uma vez */}
            {plAberta && nomes.includes(plAberta) && modoAdd && (
              <>
                <p className="dica">
                  Toque nas músicas para marcar. Toque de novo para desmarcar. Elas só entram na playlist quando você confirmar no botão abaixo.
                </p>
                {visiveis.length === 0 && <p className="vazio">Nenhuma música encontrada.</p>}
                <ul className="lista">{visiveis.map((t) => linhaSel(t, jaNaPl.has(t.id)))}</ul>
                <div className="acoes-add">
                  <button className="btn alt" onClick={sairModoAdd}>Cancelar</button>
                  <button className="btn alt" disabled={!marcadas.length} onClick={() => setMarcadas([])}>Desmarcar tudo</button>
                  <button className="btn grande" disabled={!marcadas.length} onClick={confirmarAdd}>
                    {marcadas.length
                      ? `Adicionar ${marcadas.length} ${marcadas.length === 1 ? 'música' : 'músicas'} a “${plAberta}”`
                      : `Marque músicas para “${plAberta}”`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ---------- PLAYER PEQUENO (só no celular, na página da lista) ---------- */}
      {mostrarMini && atual && (
        <div className="mini" role="region" aria-label="Player">
          <div className="mini-prog"><div style={{ width: duracao ? `${(posicao / duracao) * 100}%` : '0%' }} /></div>
          <button className="mini-info" onClick={abrirPlayer} title="Abrir o player" aria-label="Abrir o player">
            <span
              className={'mini-disc' + (tocando ? ' on' : '')}
              style={capa ? { backgroundImage: `url("${capa}")` } : undefined}
            />
            <span className="mini-txt">
              <span className="t">{titulo(atual)}</span>
              <span className="a">{artista(atual) || 'Artista desconhecido'}</span>
            </span>
          </button>
          <button className={aleatorio ? 'on' : ''} title="Aleatório" aria-pressed={aleatorio} onClick={alternarAleatorio}>
            <Icon d={P.shuffle} />
          </button>
          <button title="Anterior" onClick={anterior}><Icon d={P.prev} /></button>
          <button className="mini-play" title="Tocar / pausar" onClick={playPause}>
            <Icon d={tocando ? P.pause : P.play} />
          </button>
          <button title="Próxima" onClick={proxima}><Icon d={P.next} /></button>
          <button className={repetir !== 'off' ? 'on' : ''} title={rotuloRepetir[repetir]} onClick={alternarRepetir}>
            <Icon d={P.repeat} />
            {repetir === 'one' && <span className="badge">1</span>}
          </button>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}
    </main>
  );
}
