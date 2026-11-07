/**
 * 音乐会研习与曲目赏析文库 - 前端核心驱动
 * Concert Repertoire Archive - Core Application
 */

// 全局应用状态
const state = {
  concertIndex: [],       // 从 data/concerts-index.json 或 bundle 加载的索引列表
  activeConcertId: null,  // 当前激活的音乐会 ID
  concertCache: {},       // 缓存已拉取的单场音乐会数据 { id: data }
  activeSessionIndex: 0,  // 当前场次索引 (如上半场/下半场，第一场/第二场)
  isCheatSheetMode: false,// 是否处于 30 秒速查模式
  fontSize: 'standard',   // 字号调节状态 ('standard' | 'medium' | 'large')
  currentAudio: null,     // 当前播放中的音频对象信息
};

// 字号档位配置
const FONT_SIZES = [
  { id: 'standard', label: '标准', size: '16px' },
  { id: 'medium', label: '放大', size: '18px' },
  { id: 'large', label: '特大', size: '20px' }
];

// DOM 元素引用
const dom = {
  concertSelect: document.getElementById('concertSelect'),
  masterBanner: document.getElementById('concertMasterBanner'),
  sessionIntroBanner: document.getElementById('sessionIntroBanner'),
  sessionsTabList: document.getElementById('sessionsTabList'),
  worksPillsContainer: document.getElementById('worksPillsContainer'),
  worksContainer: document.getElementById('worksContainer'),
  fontSizeBtn: document.getElementById('fontSizeBtn'),
  fontSizeLabel: document.getElementById('fontSizeLabel'),
  cheatSheetBtn: document.getElementById('cheatSheetBtn'),
  cheatSheetLabel: document.getElementById('cheatSheetLabel'),
  readProgress: document.getElementById('readProgress'),
  footerConcertVenue: document.getElementById('footerConcertVenue'),
  // 底部音频播放器
  audioBar: document.getElementById('globalAudioBar'),
  audioElement: document.getElementById('mainAudioElement'),
  audioTrackTitle: document.getElementById('audioTrackTitle'),
  audioTrackSubtitle: document.getElementById('audioTrackSubtitle'),
  audioPlayPauseBtn: document.getElementById('audioPlayPauseBtn'),
  audioProgressBar: document.getElementById('audioProgressBar'),
  audioCurrentTime: document.getElementById('audioCurrentTime'),
  audioDuration: document.getElementById('audioDuration'),
  audioToast: document.getElementById('audioToast')
};

/**
 * 页面启动初始化
 */
async function initApp() {
  initTheme();
  initFontSize();
  setupScrollProgress();
  setupAudioPlayerEvents();

  try {
    // 优先读取本地注入数据 (完美兼容本地 Finder 双击 file:// 协议直接打开，免受现代浏览器 CORS 策略拦截)
    if (window.__CONCERTS_INDEX__ && Array.isArray(window.__CONCERTS_INDEX__) && window.__CONCERTS_INDEX__.length > 0) {
      state.concertIndex = window.__CONCERTS_INDEX__;
      if (window.__CONCERTS_DATA__) {
        state.concertCache = { ...window.__CONCERTS_DATA__ };
      }
    } else {
      // 线上环境或未注入 bundle 时使用 fetch 异步加载
      const res = await fetch('data/concerts-index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} 加载索引失败`);
      state.concertIndex = await res.json();
    }

    if (!state.concertIndex || state.concertIndex.length === 0) {
      showEmptyState('暂无已归档的音乐会数据');
      return;
    }

    // 统一规则：所有音乐会排练档案的列表按照时间从最新到历史的顺序排序 (最新在前)
    state.concertIndex.sort((a, b) => {
      const keyA = (a.dateIso || a.date || '').replace(/[^0-9]/g, '');
      const keyB = (b.dateIso || b.date || '').replace(/[^0-9]/g, '');
      return keyB.localeCompare(keyA);
    });

    // 2. 检查 URL 参数或 hash 锚定目标音乐会 (如 detail.html?id=zimerman-recital-2026)
    const urlParams = new URLSearchParams(window.location.search);
    const initialId = urlParams.get('id') || (window.location.hash ? window.location.hash.replace(/^#/, '') : null);
    const targetConcert = (initialId && state.concertIndex.find(c => c.id === initialId)) || state.concertIndex[0];

    // 3. 渲染顶部下拉选单并激活对应项
    state.activeConcertId = targetConcert.id;
    renderConcertSelector();

    // 4. 加载目标音乐会详情
    await loadConcert(targetConcert.id);
  } catch (err) {
    console.error('初始化失败:', err);
    showEmptyState(`数据加载异常: ${err.message}`);
  }
}

/**
 * 字号调节系统
 */
function initFontSize() {
  const saved = localStorage.getItem('concert_archive_font_size') || 'standard';
  setFontSize(saved);
}

function setFontSize(sizeId) {
  const target = FONT_SIZES.find(f => f.id === sizeId) || FONT_SIZES[0];
  state.fontSize = target.id;
  document.documentElement.setAttribute('data-font-size', target.id);
  document.documentElement.style.fontSize = target.size;
  if (dom.fontSizeLabel) {
    dom.fontSizeLabel.textContent = target.label;
  }
  localStorage.setItem('concert_archive_font_size', target.id);
}

function cycleFontSize() {
  const currentIdx = FONT_SIZES.findIndex(f => f.id === state.fontSize);
  const nextIdx = (currentIdx + 1) % FONT_SIZES.length;
  setFontSize(FONT_SIZES[nextIdx].id);
}

/**
 * 渲染顶部音乐会切换选单
 */
function renderConcertSelector() {
  dom.concertSelect.innerHTML = state.concertIndex.map(c => `
    <option value="${c.id}" ${c.id === state.activeConcertId ? 'selected' : ''}>
      ${c.selectorLabel || `${c.date} · ${c.venue}`}
    </option>
  `).join('');
}

/**
 * 下拉菜单切换触发
 */
async function handleConcertChange(concertId) {
  if (concertId === state.activeConcertId) return;
  await loadConcert(concertId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 异步拉取单场音乐会的具体 JSON
 */
async function loadConcert(concertId) {
  state.activeConcertId = concertId;
  state.activeSessionIndex = 0;

  // 检查前端缓存或本地注入数据
  if (!state.concertCache[concertId]) {
    if (window.__CONCERTS_DATA__ && window.__CONCERTS_DATA__[concertId]) {
      state.concertCache[concertId] = window.__CONCERTS_DATA__[concertId];
    } else {
      const meta = state.concertIndex.find(c => c.id === concertId);
      const jsonPath = meta ? meta.file : `data/concerts/${concertId}.json`;
      
      // 显示加载中状态
      dom.worksContainer.innerHTML = `
        <div class="py-20 text-center text-parchment-500 dark:text-zinc-400 font-serif">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accentGold-500 border-t-transparent mb-3"></div>
          <p class="text-sm">正在载入《${meta ? meta.title : '音乐会研习指南'}》学术档案...</p>
        </div>
      `;

      try {
        const res = await fetch(jsonPath);
        if (!res.ok) throw new Error(`HTTP ${res.status} 未找到数据文件`);
        state.concertCache[concertId] = await res.json();
      } catch (err) {
        dom.worksContainer.innerHTML = `
          <div class="p-6 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            ⚠️ 无法加载该场音乐会数据（${err.message}）。请检查该 JSON 文件是否存在。
          </div>
        `;
        return;
      }
    }
  }

  // 渲染当前场次全貌
  renderConcertView();
}

/**
 * 切换子场次 (如多场次马拉松的场次切换)
 */
function switchSession(sessIdx) {
  state.activeSessionIndex = sessIdx;
  renderSessionTabs();     // 即时重新渲染选项卡高亮态
  renderSessionContent();  // 渲染该场次的曲目内容与子导航
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 渲染场次选项卡 (Level 2: Sessions)
 */
function renderSessionTabs() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert) return;

  const sessions = concert.sessions || [];
  if (sessions.length > 1) {
    document.getElementById('sessionsTabBar').classList.remove('hidden');
    dom.sessionsTabList.innerHTML = sessions.map((sess, idx) => {
      const isActive = idx === state.activeSessionIndex;
      return `
        <button onclick="switchSession(${idx})" class="whitespace-nowrap px-3.5 py-1.5 rounded-lg font-serif transition-all flex items-center gap-1.5 ${
          isActive
            ? 'bg-accentGold-500/20 text-accentGold-700 dark:text-accentGold-300 border border-accentGold-500/50 font-bold shadow-sm'
            : 'text-parchment-600 dark:text-zinc-400 hover:bg-parchment-200/60 dark:hover:bg-obsidian-800/80 font-normal border border-transparent'
        }">
          <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accentGold-500' : 'bg-transparent'}"></span>
          <span class="font-sans text-[11px] font-semibold">${sess.sessionName || `场次 0${idx + 1}`}</span>
          <span class="hidden sm:inline text-xs opacity-75">${sess.sessionTheme ? `| ${sess.sessionTheme.split('・')[0]}` : ''}</span>
        </button>
      `;
    }).join('');
  } else {
    document.getElementById('sessionsTabBar').classList.add('hidden');
  }
}

/**
 * 渲染音乐会主视图 (Banner + Tabs + 内容)
 * 仅保留演出演出基本信息（时间、场地、演奏者），去除冗余推荐性长篇大论
 */
function renderConcertView() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert) return;

  // 1. 渲染 Master Banner：紧凑清晰的演出与阵容信息，不堆砌推介评述
  dom.masterBanner.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-accentGold-500/15 text-accentGold-700 dark:text-accentGold-400">
            ${concert.date}
          </span>
          <span class="text-xs text-parchment-500 dark:text-zinc-400 font-sans">
            📍 ${concert.venue}
          </span>
        </div>
        <h1 class="text-xl sm:text-2xl font-serif font-bold tracking-tight text-parchment-900 dark:text-zinc-100">
          ${concert.title}
        </h1>
        <p class="font-serif italic text-xs sm:text-sm text-parchment-600 dark:text-zinc-400 mt-0.5">
          ${concert.subTitle || ''}
        </p>
      </div>
      <div class="flex flex-wrap md:flex-col gap-x-4 gap-y-1.5 text-xs text-parchment-700 dark:text-zinc-300 bg-parchment-50 dark:bg-obsidian-950/80 p-2.5 rounded-xl border border-parchment-200 dark:border-obsidian-800 shrink-0">
        ${(concert.artists || []).map(a => `
          <div class="flex items-baseline gap-1.5">
            <span class="text-[10px] uppercase font-mono text-accentGold-700 dark:text-accentGold-400 font-bold">${a.role}:</span>
            <span class="font-medium text-parchment-900 dark:text-zinc-100">${a.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 2. 底部栏概览信息
  const mainArtist = concert.artists && concert.artists[0] ? concert.artists[0].name.split('(')[0] : '';
  dom.footerConcertVenue.textContent = `${concert.venue} • ${mainArtist} • ${concert.date ? concert.date.split('（')[0] : ''}`;

  // 3. 渲染场次选项卡 (Level 2: Sessions)
  renderSessionTabs();

  // 4. 渲染场次具体内容
  renderSessionContent();
}

/**
 * 渲染选定场次的曲目列表
 */
function renderSessionContent() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert || !concert.sessions) return;
  const sessions = concert.sessions || [];
  const session = sessions[state.activeSessionIndex] || sessions[0];
  if (!session) return;

  // 多场次活动时展示简明场次标识；单场音乐会直接进入曲目，不展示多余的推广引言
  if (sessions.length > 1 && (session.sessionName || session.sessionTheme)) {
    dom.sessionIntroBanner.classList.remove('hidden');
    dom.sessionIntroBanner.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-mono text-[11px] font-bold text-accentGold-700 dark:text-accentGold-400 uppercase tracking-wider">
          ${session.sessionName || `场次 0${state.activeSessionIndex + 1}`} ${session.time ? `• ${session.time}` : ''}
        </span>
        <span class="text-xs text-parchment-500 dark:text-zinc-400">共 ${session.works.length} 部作品</span>
      </div>
      <h2 class="text-sm sm:text-base font-serif font-bold text-parchment-900 dark:text-zinc-100 mt-1">
        ${session.sessionTheme || ''}
      </h2>
    `;
  } else {
    dom.sessionIntroBanner.classList.add('hidden');
  }

  // 曲目快速导航胶囊 (Level 3: Works Pills)
  dom.worksPillsContainer.innerHTML = session.works.map(w => `
    <a href="#${w.id}" class="whitespace-nowrap px-2.5 py-1 rounded-full bg-parchment-200/60 dark:bg-obsidian-850 text-parchment-800 dark:text-zinc-300 hover:border-accentGold-500/50 font-medium text-[11px] transition-all border border-parchment-300/40 dark:border-obsidian-800 flex items-center gap-1.5">
      <span class="text-accentGold-600 dark:text-accentGold-400 font-serif">§</span>
      <span>${w.composerCn ? w.composerCn.split('·').pop() : w.composer}</span>
      <span class="text-[10px] opacity-60 font-mono">${w.key ? w.key.split(' ')[0] : ''}</span>
    </a>
  `).join('');

  // 渲染曲目详细卡片
  dom.worksContainer.innerHTML = session.works.map((w, wIdx) => `
    <article id="${w.id}" class="scroll-mt-32 rounded-2xl bg-white dark:bg-obsidian-900 border border-parchment-200 dark:border-obsidian-800 p-5 sm:p-7 card-shadow transition-all">
      
      <!-- 曲目头部 -->
      <div class="border-b border-parchment-100 dark:border-obsidian-800 pb-3.5 mb-4">
        <div class="flex items-center justify-between text-xs text-accentGold-700 dark:text-accentGold-400 font-mono mb-1">
          <span>曲目 0${wIdx + 1} / 0${session.works.length}</span>
          <span class="bg-accentGold-500/10 px-2.5 py-0.5 rounded-full text-[11px] font-mono">
            ⏱ 全曲 ${w.duration || '时长未录入'}
          </span>
        </div>
        
        <h3 class="text-xl sm:text-2xl font-serif font-bold text-parchment-900 dark:text-[#F3F4F6] leading-snug">
          ${w.titleCn}
        </h3>
        <p class="font-serif italic text-sm text-parchment-600 dark:text-zinc-400 mt-0.5">
          ${w.title}
        </p>
        
        <div class="flex items-center gap-2 mt-2 text-xs font-sans">
          <span class="font-semibold text-accentGold-700 dark:text-accentGold-300">${w.composerCn}</span>
          <span class="text-parchment-300 dark:text-zinc-600">|</span>
          <span class="text-parchment-500 dark:text-zinc-400">${w.composer} ${w.dates ? `(${w.dates})` : ''}</span>
        </div>
      </div>

      <!-- 作品规格元数据 (配器与编制完全展开折行展示，不使用打点折叠) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-parchment-100/70 dark:bg-obsidian-950 border border-parchment-200/60 dark:border-obsidian-800 text-[11px] mb-4">
        <div>
          <span class="text-parchment-500 dark:text-zinc-400 block text-[10px] font-mono">调性 (KEY)</span>
          <span class="font-semibold text-parchment-800 dark:text-[#EAECEF] break-words">${w.key || '无'}</span>
        </div>
        <div>
          <span class="text-parchment-500 dark:text-zinc-400 block text-[10px] font-mono">创作年代 (ERA)</span>
          <span class="font-semibold text-parchment-800 dark:text-[#EAECEF] break-words">${w.year || '不详'}</span>
        </div>
        <div class="col-span-2">
          <span class="text-parchment-500 dark:text-zinc-400 block text-[10px] font-mono">参考全曲时长 (DURATION)</span>
          <span class="font-semibold text-parchment-800 dark:text-[#EAECEF]">${w.duration || '时长未录入'}</span>
        </div>
        <div class="col-span-2 sm:col-span-4 pt-2 border-t border-parchment-200/60 dark:border-obsidian-800/80">
          <span class="text-parchment-500 dark:text-zinc-400 block text-[10px] font-mono mb-0.5">配器 / 编制 (SCORING)</span>
          <span class="font-medium text-parchment-800 dark:text-[#EAECEF] break-words whitespace-normal leading-relaxed block">${w.instrumentation || '标准交响乐团'}</span>
        </div>
      </div>

      <!-- 30 秒速查听觉锚点 -->
      ${w.cheatSheet && w.cheatSheet.length > 0 ? `
        <div class="cheat-sheet-box p-3.5 rounded-xl bg-accentGold-500/10 dark:bg-obsidian-950 border border-accentGold-500/30 dark:border-accentGold-500/40 mb-4">
          <h4 class="text-xs font-bold text-accentGold-700 dark:text-accentGold-300 flex items-center gap-1.5 mb-2 uppercase tracking-wider font-mono">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            音乐厅 30 秒核心听觉锚点 (Key Anchors)
          </h4>
          <ul class="space-y-1.5 text-xs text-parchment-800 dark:text-[#E5E7EB] font-serif">
            ${w.cheatSheet.map(item => `
              <li class="flex items-start gap-2">
                <span class="text-accentGold-500 mt-0.5">•</span>
                <span>${item}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- 深度音乐学解析区块 (速查模式可折叠) -->
      <div class="detailed-analysis space-y-4">
        
        <!-- 创作背景 -->
        ${w.background ? `
          <div>
            <h4 class="text-[11px] font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400 mb-1">
              创作背景与历史语境 (GENESIS & CONTEXT)
            </h4>
            <p class="text-xs sm:text-sm text-parchment-800 dark:text-[#D1D5DB] font-serif leading-relaxed text-justify">
              ${w.background}
            </p>
          </div>
        ` : ''}

        <!-- 美学内核 -->
        ${w.aesthetic ? `
          <div>
            <h4 class="text-[11px] font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400 mb-1">
              美学内核与意象 (AESTHETIC ESSENCE)
            </h4>
            <p class="text-xs sm:text-sm text-parchment-800 dark:text-[#D1D5DB] font-serif leading-relaxed text-justify">
              ${w.aesthetic}
            </p>
          </div>
        ` : ''}

        <!-- 分乐章结构拆解与录音试听 (标题完整换行展示，呈现乐章预计时长) -->
        <div class="pt-1">
          <h4 class="text-[11px] font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400 mb-2">
            ${w.movements && w.movements.length > 1 ? '分乐章结构与音乐学拆解 (MOVEMENT BREAKDOWN)' : '曲式架构与音乐学深度导赏 (ANALYSIS & SECTIONS)'}
          </h4>
          
          <div class="space-y-2.5">
            ${(w.movements || []).map((m, mIdx) => {
              const hasAudio = Boolean(m.audioUrl && m.audioUrl.trim().length > 0);
              const trackData = {
                title: `${w.composerCn} · ${w.titleCn}`,
                subtitle: `${m.num ? m.num + ' ' : ''}${m.tempo}`,
                audioUrl: m.audioUrl || ''
              };
              const trackJson = encodeURIComponent(JSON.stringify(trackData));

              return `
                <details class="group rounded-xl border border-parchment-200 dark:border-obsidian-800 bg-parchment-50/80 dark:bg-obsidian-850 p-3 text-xs" open>
                  <summary class="cursor-pointer font-serif font-bold text-sm text-parchment-900 dark:text-[#F9FAFB] flex items-start sm:items-center justify-between gap-3 select-none py-0.5">
                    <div class="flex flex-wrap items-baseline gap-2 min-w-0 flex-1">
                      ${m.num ? `
                        <span class="px-2 py-0.5 rounded bg-accentGold-500/15 text-accentGold-700 dark:text-accentGold-300 font-mono text-xs font-bold shrink-0">
                          ${m.num}
                        </span>
                      ` : ''}
                      <span class="break-words font-semibold text-xs sm:text-sm leading-snug">${m.tempo}</span>
                      ${m.duration ? `
                        <span class="text-[10px] sm:text-[11px] font-mono font-normal text-accentGold-700 dark:text-accentGold-400 bg-accentGold-500/10 px-2 py-0.5 rounded-full shrink-0">
                          ⏱ ${m.duration}
                        </span>
                      ` : ''}
                    </div>

                    <div class="flex items-center gap-2 shrink-0 pt-0.5 sm:pt-0">
                      <!-- 录音试听控制钮 -->
                      ${hasAudio ? `
                        <button type="button" onclick="playMovementAudio(event, '${trackJson}')" class="px-2.5 py-0.5 rounded-full bg-accentGold-500/20 hover:bg-accentGold-500 text-accentGold-800 dark:text-accentGold-300 hover:text-white dark:hover:text-obsidian-950 font-sans text-[11px] font-medium flex items-center gap-1 transition-all">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3.5v13l11-6.5-11-6.5z"/></svg>
                          <span>录音</span>
                        </button>
                      ` : `
                        <button type="button" onclick="showAudioToast(event)" class="px-2 py-0.5 rounded-full bg-parchment-200 dark:bg-obsidian-800 text-parchment-400 dark:text-zinc-500 font-sans text-[10px] flex items-center gap-1 opacity-70 hover:opacity-100">
                          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"/></svg>
                          <span>待归档</span>
                        </button>
                      `}
                      <span class="text-parchment-400 dark:text-zinc-500 group-open:rotate-180 transition-transform text-xs font-mono">▾</span>
                    </div>
                  </summary>
                  
                  <div class="mt-2.5 pt-2.5 border-t border-parchment-200/80 dark:border-obsidian-800 space-y-2">
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      ${m.duration ? `<span class="text-parchment-600 dark:text-zinc-400">预计时长: <strong class="text-accentGold-700 dark:text-accentGold-300 font-mono font-semibold">${m.duration}</strong></span>` : ''}
                      ${m.meter ? `<span class="text-parchment-600 dark:text-zinc-400">节拍: <strong class="text-parchment-900 dark:text-[#F3F4F6] font-sans font-semibold">${m.meter}</strong></span>` : ''}
                      ${m.form ? `<span class="text-parchment-600 dark:text-zinc-400">曲式架构: <strong class="text-accentGold-700 dark:text-accentGold-300 font-sans font-semibold">${m.form}</strong></span>` : ''}
                      ${m.affekt ? `<span class="text-parchment-600 dark:text-zinc-400">情态表情: <strong class="text-parchment-900 dark:text-[#F3F4F6] font-serif italic">${m.affekt}</strong></span>` : ''}
                    </div>
                    
                    <div class="p-3.5 rounded-lg bg-parchment-100/90 dark:bg-obsidian-950 border border-parchment-200/70 dark:border-obsidian-800 text-xs sm:text-sm text-parchment-800 dark:text-[#E2E8F0] font-serif leading-relaxed text-justify space-y-2">
                      ${m.highlights}
                    </div>
                  </div>
                </details>
              `;
            }).join('')}
          </div>
        </div>

      </div>

    </article>
  `).join('');

  // 保持当前的速查模式展开/收起状态
  if (state.isCheatSheetMode) {
    document.querySelectorAll('.detailed-analysis').forEach(el => el.classList.add('hidden'));
  }
}

/**
 * 解析音频播放链接（支持 GitHub Releases 动态解析）
 */
function resolveAudioUrl(url) {
  if (!url) return '';
  if (url.startsWith('release:')) {
    const raw = url.slice(8);
    const slashIdx = raw.indexOf('/');
    const tag = slashIdx !== -1 ? raw.slice(0, slashIdx) : 'v1.0-audio';
    const file = slashIdx !== -1 ? raw.slice(slashIdx + 1) : raw;
    return ['https:', '', 'github.com', 'GiovanniGuoJY', 'concert-archive', 'releases', 'download', tag, file].join('/');
  }
  return url;
}

/**
 * 播放特定乐章音频
 */
function playMovementAudio(event, trackJsonEncoded) {
  event.stopPropagation();
  event.preventDefault();
  const track = JSON.parse(decodeURIComponent(trackJsonEncoded));
  const resolvedUrl = resolveAudioUrl(track.audioUrl);
  if (!resolvedUrl) {
    showAudioToast(event);
    return;
  }

  dom.audioBar.classList.remove('hidden');
  dom.audioTrackTitle.textContent = track.title;
  dom.audioTrackSubtitle.textContent = track.subtitle;
  
  if (dom.audioElement.src !== resolvedUrl) {
    dom.audioElement.src = resolvedUrl;
  }
  dom.audioElement.play().catch(e => console.warn('音频播放受限:', e));
  state.currentAudio = { ...track, resolvedUrl };
  updatePlayPauseIcon(true);
}

/**
 * 录音未录入时的提示气泡
 */
function showAudioToast(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const toast = dom.audioToast;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  toast.classList.add('opacity-100');
  setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2200);
}

/**
 * 设置播放器事件监听
 */
function setupAudioPlayerEvents() {
  const audio = dom.audioElement;
  
  // 播放/暂停切换
  dom.audioPlayPauseBtn.onclick = () => {
    if (audio.paused) {
      audio.play();
      updatePlayPauseIcon(true);
    } else {
      audio.pause();
      updatePlayPauseIcon(false);
    }
  };

  // 进度条拖动
  dom.audioProgressBar.oninput = (e) => {
    if (audio.duration) {
      audio.currentTime = (e.target.value / 100) * audio.duration;
    }
  };

  // 播放时间更新
  audio.ontimeupdate = () => {
    if (audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      dom.audioProgressBar.value = pct;
      dom.audioCurrentTime.textContent = formatTime(audio.currentTime);
      dom.audioDuration.textContent = formatTime(audio.duration);
    }
  };

  audio.onended = () => {
    updatePlayPauseIcon(false);
  };
}

function updatePlayPauseIcon(isPlaying) {
  dom.audioPlayPauseBtn.innerHTML = isPlaying
    ? `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
    : `<svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
}

function closeAudioBar() {
  dom.audioElement.pause();
  dom.audioBar.classList.add('hidden');
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * 30 秒极速速查模式切换
 */
function toggleCheatSheet() {
  state.isCheatSheetMode = !state.isCheatSheetMode;
  const btn = dom.cheatSheetBtn;
  const label = dom.cheatSheetLabel;

  if (state.isCheatSheetMode) {
    label.textContent = "全析";
    btn.classList.add('bg-accentGold-500', 'text-white', 'dark:bg-accentGold-500', 'dark:text-obsidian-950');
    document.querySelectorAll('.detailed-analysis').forEach(el => el.classList.add('hidden'));
  } else {
    label.textContent = "速查";
    btn.classList.remove('bg-accentGold-500', 'text-white', 'dark:bg-accentGold-500', 'dark:text-obsidian-950');
    document.querySelectorAll('.detailed-analysis').forEach(el => el.classList.remove('hidden'));
  }
}

/**
 * 日夜模式切换
 */
function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('concert_archive_theme', isDark ? 'dark' : 'light');
}

function initTheme() {
  if (
    localStorage.getItem('concert_archive_theme') === 'dark' ||
    (!('concert_archive_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

/**
 * 顶部阅读进度条
 */
function setupScrollProgress() {
  window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    dom.readProgress.style.width = scrolled + '%';
  });
}

function showEmptyState(msg) {
  dom.worksContainer.innerHTML = `
    <div class="py-16 text-center text-parchment-500 dark:text-zinc-400">
      <p class="font-serif text-base">${msg}</p>
    </div>
  `;
}

// 启动入口
window.addEventListener('DOMContentLoaded', initApp);
