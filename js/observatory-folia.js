// The same Folia frame stays mounted across every view. Only its presentation changes.
export function connectFolia(config, { icon, onExpand, onSurfaceReady }) {
  const $ = selector => document.querySelector(selector);
  const frame = $('#folia-frame');
  const workspace = $('#folia-workspace');
  const root = $('#observatory');
  const target = new URL(config.foliaURL, location.href);
  target.searchParams.set('embed', 'blog');
  const channel = 'folia-blog-v1';
  let started = false, ready = false, watchdog, handshake;
  let ambientMotion = 'hidden', surfaceReady = false;
  let state = {}, tracks = [], error = false, expanded = false, retryKind = 'playlist', pendingSong, articleNotice, articleSongId;
  const fmt = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
  const send = (command, value) => frame.contentWindow?.postMessage({ channel, command, value }, target.origin);
  const fail = text => { error = true; $('#music-message').textContent = text; $('#music-retry').hidden = false; };
  function start() {
    if (started) return;
    started = true;
    frame.src = target.href;
    handshake = setInterval(() => send('hello'), 1500);
    watchdog = setTimeout(() => { clearInterval(handshake); fail('Folia 暂时未能连接，请重新连接。'); }, 45000);
  }
  function expand(value) {
    start(); expanded = value;
    workspace.classList.toggle('is-open', value);
    workspace.inert = !value;
    workspace.setAttribute('aria-hidden', String(!value));
    frame.tabIndex = value ? 0 : -1;
    onExpand?.(value);
    if (value) { send(state.title ? 'player' : 'library'); $('#folia-collapse').focus(); }
    else { send('ambient', ambientMotion); if (!$('#music-panel').hidden) $('#folia-expand').focus({ preventScroll: true }); }
  }
  function renderState() {
    const title = state.title || tracks[0]?.title || '音乐空间';
    $('#music-title').textContent = title;
    $('#music-artist').textContent = state.artist || tracks[0]?.artist || (ready ? '选择一首喜欢的歌' : '正在打开歌单');
    for (const id of ['#music-play', '#mini-play']) {
      $(id).disabled = !ready || (!tracks.length && !state.title);
      $(id).innerHTML = icon(state.playing ? 'pause' : 'play');
      $(id).setAttribute('aria-label', state.playing ? '暂停播放' : '播放音乐');
    }
    $('#mini-equalizer').hidden = !state.playing;
    $('#music-next').disabled = $('#music-previous').disabled = !state.title;
    $('#mini-track-label').textContent = state.title || '音乐空间';
    $('#music-duration').textContent = fmt(state.duration);
    $('#music-elapsed').textContent = fmt(state.time);
    $('#music-progress').disabled = !(state.duration > 0);
    if (document.activeElement !== $('#music-progress')) $('#music-progress').value = state.duration ? String(state.time / state.duration * 100) : '0';
    $('#music-mute').innerHTML = icon(state.muted ? 'muted' : 'audio');
    $('#music-mute').setAttribute('aria-pressed', String(!!state.muted));
    $('#music-mute').setAttribute('aria-label', state.muted ? '取消静音' : '静音');
    if (!error && ready) $('#music-message').textContent = state.loading ? '正在加载歌曲…' : state.title ? '' : tracks.length ? '点击播放，歌词随音乐浮现' : '正在读取歌单…';
    $('#music-message').hidden = !$('#music-message').textContent;
    $('#music-track-list').querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-current', index === state.index ? 'true' : 'false'));
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== target.origin || event.data?.channel !== channel) return;
    const { type, payload } = event.data;
    if (type === 'ready') {
      ready = true; error = false;
      clearTimeout(watchdog); clearInterval(handshake);
      $('#music-retry').hidden = true;
      $('#music-source').textContent = '网易云音乐';
      send('playlist', config.playlist);
      if (!expanded) send('ambient', ambientMotion);
      if (pendingSong) { send('song', pendingSong); pendingSong = null; }
    } else if (type === 'surface-ready') {
      surfaceReady = true;
      root.dataset.musicReady = 'true';
      onSurfaceReady?.();
    } else if (type === 'playlist' && Array.isArray(payload)) {
      tracks = payload; error = false; $('#music-retry').hidden = true;
      $('#music-source').textContent = `网易云 · ${tracks.length} 首`;
      $('#music-track-list').replaceChildren(...tracks.map((track, index) => {
        const button = document.createElement('button'); button.type = 'button';
        const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
        const name = document.createElement('span'); name.textContent = track.title;
        const artist = document.createElement('small'); artist.textContent = track.artist;
        button.append(number, name, artist);
        button.addEventListener('click', () => { error = false; send('track', index); });
        return button;
      }));
      if (!tracks.length) fail('这份歌单暂时没有可读取的歌曲。');
    } else if (type === 'state' && payload && typeof payload === 'object') {
      if (payload.playing) {
        error = false; $('#music-retry').hidden = true;
        if (payload.songId === articleSongId) { articleNotice?.('正在播放本文配乐，可在左下角控制。'); articleNotice = null; }
      }
      state = payload;
    } else if (type === 'error') {
      retryKind = payload?.code === 'playlist' ? 'playlist' : 'playback';
      $('#music-retry').textContent = retryKind === 'playlist' ? '重试歌单' : '重试播放';
      fail(retryKind === 'playlist' ? '歌单暂时无法读取，请重试或打开 Folia 曲库。' : '这首歌暂时无法播放，可以换一首或在 Folia 中查看详情。');
      if (retryKind === 'playback') {
        const reason = typeof payload.message === 'string' ? payload.message.slice(0, 300) : '此曲暂时无法播放，可打开音乐空间查看详情或换一首。';
        articleNotice?.(reason); articleNotice = null;
      }
    }
    renderState();
  });
  for (const id of ['#music-play', '#mini-play']) $(id).addEventListener('click', () => { error = false; start(); send('toggle'); });
  $('#music-previous').addEventListener('click', () => send('previous'));
  $('#music-next').addEventListener('click', () => send('next'));
  $('#music-mute').addEventListener('click', () => send('mute', !state.muted));
  $('#music-progress').addEventListener('input', event => send('seek', state.duration * Number(event.target.value) / 100));
  $('#music-queue').addEventListener('click', () => { const list = $('#music-track-list'); list.hidden = !list.hidden; $('#music-queue').setAttribute('aria-expanded', String(!list.hidden)); });
  $('#music-retry').addEventListener('click', () => {
    error = false; $('#music-retry').hidden = true;
    if (ready) {
      if (retryKind === 'playback') send('track', Math.max(0, state.index ?? 0));
      else send('playlist', config.playlist);
    }
    else { clearInterval(handshake); clearTimeout(watchdog); started = false; start(); }
  });
  $('#folia-expand').addEventListener('click', () => expand(true));
  $('#folia-collapse').addEventListener('click', () => expand(false));
  $('#folia-library').addEventListener('click', () => send('library'));
  $('#folia-player').addEventListener('click', () => send('player'));
  document.addEventListener('click', event => {
    if (!event.target.closest('#music-panel')) { $('#music-track-list').hidden = true; $('#music-queue').setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && expanded) expand(false); });
  return { start, get surfaceReady() { return surfaceReady; }, setAmbient(motion) {
    if (motion === ambientMotion) return;
    ambientMotion = motion;
    if (ready && !expanded) send('ambient', motion);
  }, close: () => { if (expanded) expand(false); }, playSong(id, report) {
    if (!/^\d{1,20}$/.test(id)) return;
    articleNotice = report;
    articleSongId = id;
    start();
    if (ready) send('song', id); else pendingSong = id;
  } };
}
