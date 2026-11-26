import { mountGD } from './gd.js';
import { createLatestTask, withMusicTimeout } from './music-tasks.js';
import { refreshSelect } from './ui-select.js';
import { uiConfirm, uiToast } from './ui-dialog.js';

export function mountNetease(settings, shared) {
  const box = document.createElement('section');
  box.className = 'cap-backup cap-netease-box';
  box.innerHTML = `
    <div class="cap-net-card cap-net-privacy-card">
      <h4>音源与隐私模式</h4>
      <label class="cap-net-mode-label">隐私模式
        <select data-privacy-mode>
          <option value="local">本地记忆 / 手动音源</option>
          <option value="gd">本地模式 · GD 免登录音源</option>
          <option value="online">在线音乐（私有网关）</option>
          <option value="full">完整服务（账号及云端歌单）</option>
        </select>
      </label>
      <label class="cap-net-toggle" data-online-wrap>
        <input type="checkbox" data-online-toggle>
        <span>启用网易云自动匹配（仅发送歌名和歌手）</span>
      </label>
      <details class="cap-privacy-note">
        <summary>隐私与联网说明</summary>
        <p data-disclosure>联网会向所选服务发送歌曲查询、歌曲ID；完整服务还会发送账号及歌单操作。GD 模式仅向 GD音乐台 (music.gdstudio.xyz) 发送歌曲查询及ID，限个人学习、非商用，请仅播放有权访问的资源。服务管理员可能接触凭证。手动音源和封面仍会连接其提供方。</p>
      </details>
    </div>

    <div class="cap-net-card cap-net-gateway-card" data-gateway-card>
      <h4>声屿 · 共享服务网关</h4>
      <label>HTTPS 服务地址<input type="url" data-url placeholder="https://your-service.onrender.com"></label>
      <label>邀请码 / 管理员密钥<input type="password" data-key autocomplete="off"></label>
      <div class="cap-net-actions">
        <button type="button" data-save class="cap-btn-primary">保存连接</button>
        <button type="button" data-test>连接检测</button>
        <button type="button" data-retry>取消检测</button>
        <button type="button" data-forget>清除凭证</button>
      </div>
      <p data-status role="status"></p>
    </div>

    <section class="cap-net-card cap-net-admin-card" data-admin-panel hidden>
      <h4>共享管理</h4>
      <div class="cap-net-inline-row">
        <input placeholder="好友备注" data-note>
        <button type="button" data-create class="cap-btn-primary">创建邀请码</button>
        <button type="button" data-list>刷新好友</button>
      </div>
      <input readonly data-token placeholder="新邀请码（仅显示一次）">
      <div class="cap-net-guests" data-guests></div>
    </section>

    <div class="cap-net-card cap-net-auth-card" data-auth-card>
      <h4>网易云账号</h4>
      <div class="cap-net-actions">
        <button type="button" data-login class="cap-btn-primary">生成登录二维码</button>
        <button type="button" data-account>查看账号</button>
        <button type="button" data-logout>退出本地会话</button>
      </div>
      <img hidden alt="网易云登录二维码" style="width:180px;max-width:100%">
      <p data-auth-status role="status"></p>
    </div>
  `;
  settings.append(box);

  const mode = box.querySelector('[data-privacy-mode]');
  const disclosure = box.querySelector('[data-disclosure]');
  const onlineWrap = box.querySelector('[data-online-wrap]');
  const enabled = box.querySelector('[data-online-toggle]');
  const gatewayCard = box.querySelector('[data-gateway-card]');
  const url = box.querySelector('[data-url]');
  const key = box.querySelector('[data-key]');
  const status = box.querySelector('[data-status]');
  const forget = box.querySelector('[data-forget]');
  const adminPanel = box.querySelector('[data-admin-panel]');
  const authCard = box.querySelector('[data-auth-card]');
  const img = authCard.querySelector('img');
  const note = authCard.querySelector('[data-auth-status]');

  let controller, retryTimer, disposed = false, loggedIn = false;
  const gd = mountGD();
  const accountState = v => { loggedIn = !!v; shared.onAccountChange?.(); };
  shared.accountReady = () => !disposed && mode.value === 'full' && loggedIn;

  try {
    url.value = localStorage.getItem('capricorn_music_endpoint') || '';
    key.value = localStorage.getItem('capricorn_music_token:' + url.value) || '';
  } catch {}
  mode.value = localStorage.getItem('capricorn_privacy_mode') || 'local';
  enabled.checked = localStorage.getItem('capricorn_online') === 'true';

  const onlineTasks = createLatestTask();
  let connection = onlineTasks.start();
  function resetOnline() {
    connection = onlineTasks.start();
    shared.onMusicConnectionChange?.();
  }

  function syncModeVisibility() {
    const m = mode.value;
    const needsGateway = m === 'online' || m === 'full';
    gatewayCard.hidden = !needsGateway;
    authCard.hidden = m !== 'full';
    onlineWrap.hidden = m === 'local' || m === 'gd';
    if (!needsGateway) adminPanel.hidden = true;
  }
  syncModeVisibility();

  const allowed = path => {
    if (path === '/auth/logout') return true;
    if (['local', 'gd'].includes(mode.value)) return false;
    if (mode.value === 'full') return true;
    return path === '/health' || path.startsWith('/music/');
  };

  mode.onchange = async () => {
    if (mode.value !== 'local' && !await uiConfirm(disclosure.textContent + '\n\n是否授权切换？', { title: '联网与隐私授权', confirmText: '同意并切换' })) {
      mode.value = localStorage.getItem('capricorn_privacy_mode') || 'local';
      refreshSelect(mode);
      syncModeVisibility();
      return;
    }
    localStorage.setItem('capricorn_privacy_mode', mode.value);
    syncModeVisibility();
    resetOnline();
    cancelCheck();
    stop();
    accountState(false);
    adminPanel.hidden = true;
    status.textContent = '隐私模式已更新';
    if (mode.value === 'full') void check(0);
  };

  url.onchange = () => {
    resetOnline();
    cancelCheck();
    stop();
    accountState(false);
    adminPanel.hidden = true;
    try { key.value = localStorage.getItem('capricorn_music_token:' + endpoint()) || ''; }
    catch { key.value = ''; }
  };
  key.onchange = resetOnline;

  forget.onclick = () => {
    resetOnline();
    cancelCheck();
    stop();
    accountState(false);
    note.textContent = '';
    try {
      localStorage.removeItem('capricorn_music_token:' + endpoint());
      key.value = '';
      adminPanel.hidden = true;
      status.textContent = '本地凭证已清除'; uiToast('已清除本地凭证', { kind: 'info' });
    } catch (e) {
      status.textContent = e.message;
    }
  };

  function endpoint() {
    const u = new URL(url.value.trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
      throw Error('请输入 HTTPS 服务根地址');
    }
    return u.origin;
  }

  box.querySelector('[data-save]').onclick = () => {
    try {
      localStorage.setItem('capricorn_music_endpoint', endpoint());
      localStorage.setItem('capricorn_music_token:' + endpoint(), key.value.trim());
      status.textContent = '连接已保存'; uiToast('网关连接已保存', { kind: 'success' });
      void check(0);
    } catch (e) {
      status.textContent = e.message;
    }
  };

  function cancelCheck() {
    clearTimeout(retryTimer);
    controller?.abort();
    controller = null;
  }
  box.querySelector('[data-retry]').onclick = () => {
    cancelCheck();
    status.textContent = '检测已取消';
  };

  async function check(attempt = 0) {
    cancelCheck();
    if (disposed || ['local', 'gd'].includes(mode.value) || !key.value.trim()) return;
    const c = new AbortController();
    controller = c;
    const timer = setTimeout(() => c.abort(), 60000);
    try {
      const base = endpoint(), secret = key.value.trim();
      status.textContent = '正在自动连接…';
      const r = await fetch(base + '/health', {
        headers: { Authorization: 'Bearer ' + secret },
        signal: c.signal,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!r.ok) { const e = Error('HTTP ' + r.status); e.status = r.status; throw e; }
      const data = await r.json();
      if (data.service !== 'capricorn-music') throw Error('服务标识不匹配');
      if (controller !== c || disposed || key.value.trim() !== secret || endpoint() !== base) return;
      adminPanel.hidden = !data.admin;
      status.textContent = '连接成功；上游音乐接口：' + (data.upstream ? '已配置' : '未配置');
      const n = epoch;
      try {
        const a = await request('/auth/account', 'GET', base, secret, c.signal);
        if (controller === c && n === epoch && !disposed) {
          accountState(a.loggedIn);
          note.textContent = a.loggedIn ? '已登录：' + a.nickname : '未登录';
        }
      } catch {
        if (controller === c && n === epoch) note.textContent = '账号状态暂不可用，可手动查看';
      }
    } catch (e) {
      if (controller !== c || disposed) return;
      adminPanel.hidden = true;
      status.textContent = '连接失败：' + e.message;
      if (attempt < 2 && (!e.status || e.status === 429 || e.status >= 500)) {
        retryTimer = setTimeout(() => void check(attempt + 1), 5000 * (attempt + 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  box.querySelector('[data-test]').onclick = () => void check(0);

  function timedRequest(path, method, base, secret, timeout) {
    return withMusicTimeout(signal => request(path, method, base, secret, signal), timeout);
  }
  async function manage(path, method = 'GET') {
    return timedRequest(path, method, endpoint(), key.value.trim(), 30000);
  }
  async function list() {
    const d = await manage('/admin/guests');
    const area = adminPanel.querySelector('[data-guests]');
    area.replaceChildren();
    for (const g of d.guests) {
      const row = document.createElement('div');
      row.className = 'cap-net-guest-row';
      const span = document.createElement('span');
      span.textContent = g.note || '未命名好友';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '撤销';
      b.onclick = async () => {
        if (!await uiConfirm('撤销后该好友将无法继续连接共享服务。', { title: '撤销访问权限', danger: true, confirmText: '撤销' })) return;
        try { await manage('/admin/revoke?id=' + encodeURIComponent(g.id), 'POST'); await list(); }
        catch (e) { status.textContent = e.message; }
      };
      row.append(span, b);
      area.append(row);
    }
  }
  adminPanel.querySelector('[data-list]').onclick = () => list().catch(e => { status.textContent = e.message; });
  adminPanel.querySelector('[data-create]').onclick = async () => {
    try {
      const d = await manage('/admin/create?note=' + encodeURIComponent(adminPanel.querySelector('[data-note]').value), 'POST');
      adminPanel.querySelector('[data-token]').value = d.token;
      await list();
    } catch (e) {
      status.textContent = e.message;
    }
  };

  let epoch = 0, active;
  const stop = () => { epoch++; active?.abort(); img.hidden = true; img.removeAttribute('src'); };
  async function request(path, method, base, secret, signal) {
    if (!allowed(path)) throw Error('当前隐私模式禁止此请求');
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: 'Bearer ' + secret },
      signal,
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    let d;
    try { d = await r.json(); } catch { throw Error(path + '：HTTP ' + r.status + '，服务未返回有效 JSON'); }
    if (!r.ok) throw Error(path + '：HTTP ' + r.status);
    if (!d || typeof d !== 'object') throw Error(path + '：响应格式错误');
    return d;
  }
  function run(fn) {
    stop();
    const n = epoch, c = new AbortController();
    active = c;
    const timer = setTimeout(() => c.abort(), 150000);
    Promise.resolve().then(() => fn(endpoint(), key.value.trim(), c.signal, n))
      .catch(e => { if (n === epoch) note.textContent = '操作失败：' + e.message; })
      .finally(() => clearTimeout(timer));
  }
  async function account(base, secret, signal, n) {
    const a = await request('/auth/account', 'GET', base, secret, signal);
    if (n === epoch) {
      accountState(a.loggedIn);
      note.textContent = a.loggedIn ? '已登录：' + a.nickname : '未登录';
    }
  }
  authCard.querySelector('[data-login]').onclick = () => run(async (base, secret, signal, n) => {
    note.textContent = '正在生成二维码…';
    const d = await withMusicTimeout(s => request('/auth/start', 'POST', base, secret, s), 45000, signal);
    if (n !== epoch) return;
    const raw = d.image ?? d.qrimg ?? d.data?.image ?? d.data?.qrimg;
    const image = typeof raw === 'string' ? raw.trim().replace(/\s/g, '') : '';
    if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image)) throw Error('/auth/start：未返回有效二维码图片');
    img.onerror = () => { if (n === epoch) note.textContent = '二维码图片加载失败，请检查宿主图片权限'; };
    img.src = image;
    img.hidden = false;
    note.textContent = '请使用网易云音乐扫描二维码（同一部手机需借助另一屏幕）';
    while (n === epoch && !signal.aborted) {
      await new Promise(r => setTimeout(r, 3000));
      if (n !== epoch || signal.aborted) return;
      const p = await request('/auth/poll', 'POST', base, secret, signal);
      if (n !== epoch) return;
      if (Number(p.code) === 803) { img.hidden = true; await account(base, secret, signal, n); return; }
      if (Number(p.code) === 800) { img.hidden = true; note.textContent = '二维码已过期，请重新生成'; return; }
      note.textContent = Number(p.code) === 802 ? '已扫码，请在网易云确认' : '等待扫码';
    }
  });
  authCard.querySelector('[data-account]').onclick = () => run(account);
  authCard.querySelector('[data-logout]').onclick = () => run(async (base, secret, signal, n) => {
    await request('/auth/logout', 'POST', base, secret, signal);
    if (n === epoch) { accountState(false); note.textContent = '网关本地会话已清除'; }
  });

  enabled.onchange = () => {
    localStorage.setItem('capricorn_online', String(enabled.checked));
    resetOnline();
  };

  shared.online = {
    ready: () => !disposed && (mode.value === 'gd' || mode.value !== 'local' && enabled.checked && !!key.value.trim() && !!url.value.trim()),
    async get(path, timeout = 25000, signal) {
      if (!this.ready()) throw Error('请在设置启用网易云并填写密钥');
      const load = mode.value === 'gd'
        ? requestSignal => gd.get(path, requestSignal)
        : requestSignal => request(path, 'GET', endpoint(), key.value.trim(), requestSignal);
      return withMusicTimeout(load, timeout, connection.signal, signal);
    },
  };
  shared.cloud = {
    capture() {
      if (!shared.accountReady()) throw Error('请先登录账号并授权完整服务');
      const base = endpoint(), secret = key.value.trim();
      if (!secret) throw Error('请先保存连接');
      return {
        base,
        request(p, m = 'GET') {
          if (disposed || endpoint() !== base || key.value.trim() !== secret) throw Error('连接已切换');
          return timedRequest(p, m, base, secret, 90000);
        },
      };
    },
    request(path, method = 'GET') {
      if (!shared.accountReady()) throw Error('请先登录账号');
      const base = endpoint(), secret = key.value.trim();
      if (!secret) throw Error('请先保存连接');
      return timedRequest(path, method, base, secret, 90000);
    },
  };

  if (!['local', 'gd'].includes(mode.value) && key.value.trim()) void check(0);
  return () => {
    disposed = true;
    onlineTasks.cancel();
    cancelCheck();
    delete shared.online;
    delete shared.cloud;
    stop();
    key.value = '';
    box.remove();
  };
}
