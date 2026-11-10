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
  activeWorkIndex: 0,     // 当前选中的曲目索引 (Tab 切换)
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
  state.activeWorkIndex = 0;

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
  state.activeWorkIndex = 0;
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
/**
 * 切换选中的曲目 (Tab 切换单曲深度赏析)
 */
function switchWork(workIndex) {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert || !concert.sessions) return;
  const sessions = concert.sessions || [];
  const session = sessions[state.activeSessionIndex] || sessions[0];
  if (!session || !session.works) return;

  if (workIndex < 0 || workIndex >= session.works.length) return;
  state.activeWorkIndex = workIndex;

  renderWorkTabs();
  renderActiveWork();

  // 平滑滚动回曲目顶部
  const root = document.getElementById('workContentRoot');
  if (root) {
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 保证当前曲目 Tab 按钮居中可见
  const activeTabBtn = document.getElementById(`workTabBtn_${workIndex}`);
  if (activeTabBtn) {
    activeTabBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

/**
 * 渲染曲目导航 Tab 栏 (Level 3: Work Tabs)
 */
function renderWorkTabs() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert || !concert.sessions) return;
  const sessions = concert.sessions || [];
  const session = sessions[state.activeSessionIndex] || sessions[0];
  if (!session || !session.works) return;

  dom.worksPillsContainer.innerHTML = session.works.map((w, wIdx) => {
    const isActive = wIdx === state.activeWorkIndex;
    const composerShort = w.composerCn ? w.composerCn.split('·').pop().trim() : (w.composer || '');
    const titleShort = w.titleCn.length > 10 ? w.titleCn.slice(0, 9) + '…' : w.titleCn;

    return `
      <button type="button" onclick="switchWork(${wIdx})" id="workTabBtn_${wIdx}" class="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-serif transition-all flex items-center gap-1.5 shrink-0 ${
        isActive
          ? 'bg-accentGold-500 text-white dark:bg-accentGold-500 dark:text-obsidian-950 font-bold shadow-sm ring-1 ring-accentGold-500/50'
          : 'bg-parchment-100 dark:bg-obsidian-800 text-parchment-700 dark:text-zinc-300 hover:bg-parchment-200/80 dark:hover:bg-obsidian-750 font-medium border border-parchment-200/80 dark:border-obsidian-700/80'
      }">
        <span class="font-mono text-[10px] opacity-75">0${wIdx + 1}</span>
        <span>${composerShort}</span>
        <span class="opacity-80 font-sans text-[11px] hidden sm:inline">${titleShort}</span>
      </button>
    `;
  }).join('');
}

/**
 * 渲染选定场次的曲目结构与单曲正文
 */
function renderSessionContent() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert || !concert.sessions) return;
  const sessions = concert.sessions || [];
  const session = sessions[state.activeSessionIndex] || sessions[0];
  if (!session || !session.works || session.works.length === 0) return;

  // 多场次活动时展示简明场次标识；单场音乐会直接进入曲目
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

  // 1. 渲染顶部曲目 Tab 切换条
  renderWorkTabs();

  // 2. 渲染当前选中曲目的完整乐章解析与导赏正文 (去框化优雅排版)
  renderActiveWork();
}

/**
 * 渲染当前激活单曲的全部乐章与学术研习正文（无层叠框框、通透书籍化排版）
 */
function renderActiveWork() {
  const concert = state.concertCache[state.activeConcertId];
  if (!concert || !concert.sessions) return;
  const sessions = concert.sessions || [];
  const session = sessions[state.activeSessionIndex] || sessions[0];
  if (!session || !session.works || session.works.length === 0) return;

  // 边界保护
  if (state.activeWorkIndex >= session.works.length) {
    state.activeWorkIndex = 0;
  }

  const w = session.works[state.activeWorkIndex];
  const wIdx = state.activeWorkIndex;
  const totalWorks = session.works.length;

  dom.worksContainer.innerHTML = `
    <article id="workContentRoot" class="scroll-mt-28 space-y-6">
      
      <!-- 曲目头部（大标题、曲目编号与作曲家，不套厚重卡片外框） -->
      <header class="pb-4 border-b border-parchment-200 dark:border-obsidian-800">
        <div class="flex items-center justify-between text-xs text-accentGold-700 dark:text-accentGold-400 font-mono mb-2">
          <span class="font-bold tracking-wider uppercase">曲目 0${wIdx + 1} / 0${totalWorks}</span>
          <span class="bg-accentGold-500/10 px-2.5 py-0.5 rounded-full text-[11px] font-mono">
            ⏱ 参考全曲 ${w.duration || '时长未录入'}
          </span>
        </div>
        
        <h2 class="text-2xl sm:text-3xl font-serif font-bold text-parchment-900 dark:text-[#F3F4F6] tracking-tight leading-snug">
          ${w.titleCn}
        </h2>
        <p class="font-serif italic text-sm text-parchment-600 dark:text-zinc-400 mt-1 leading-normal">
          ${w.title}
        </p>
        
        <div class="flex items-center gap-2 mt-2.5 text-xs font-sans">
          <span class="font-semibold text-accentGold-700 dark:text-accentGold-300 text-sm">${w.composerCn}</span>
          <span class="text-parchment-300 dark:text-zinc-600">|</span>
          <span class="text-parchment-500 dark:text-zinc-400">${w.composer} ${w.dates ? `(${w.dates})` : ''}</span>
        </div>
      </header>

      <!-- 作品规格元数据（轻量展开排版，告别嵌套死板方框） -->
      <section class="py-3 border-b border-parchment-200/80 dark:border-obsidian-800/80 text-xs text-parchment-700 dark:text-zinc-300 font-sans space-y-2">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span>调性: <strong class="font-semibold text-parchment-900 dark:text-zinc-100">${w.key || '无'}</strong></span>
          <span class="text-parchment-300 dark:text-zinc-700">•</span>
          <span>创作年代: <strong class="font-semibold text-parchment-900 dark:text-zinc-100">${w.year || '不详'}</strong></span>
          <span class="text-parchment-300 dark:text-zinc-700">•</span>
          <span>全曲时长: <strong class="font-semibold text-parchment-900 dark:text-zinc-100">${w.duration || '未录入'}</strong></span>
        </div>
        <div class="text-[11px] text-parchment-600 dark:text-zinc-400 leading-relaxed pt-0.5">
          <span class="font-mono uppercase font-bold text-parchment-500 dark:text-zinc-500">配器 / 编制:</span>
          <span class="text-parchment-800 dark:text-zinc-200 font-medium ml-1">${w.instrumentation || '标准交响乐团'}</span>
        </div>
      </section>

      <!-- 30 秒速查听觉锚点（左侧金色引用重音线风格，自然融入正文流） -->
      ${w.cheatSheet && w.cheatSheet.length > 0 ? `
        <section class="cheat-sheet-box my-5 pl-4 py-3 pr-3 border-l-2 border-accentGold-500 bg-accentGold-500/5 dark:bg-accentGold-500/10 rounded-r-xl">
          <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-accentGold-700 dark:text-accentGold-400 flex items-center gap-1.5 mb-2">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            音乐厅 30 秒核心听觉锚点 (Key Anchors)
          </h3>
          <ul class="space-y-1.5 text-xs text-parchment-800 dark:text-[#E5E7EB] font-serif leading-relaxed">
            ${w.cheatSheet.map(item => `
              <li class="flex items-start gap-2">
                <span class="text-accentGold-500 mt-0.5">•</span>
                <span>${item}</span>
              </li>
            `).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- 深度音乐学解析区块 (速查模式可一键折叠) -->
      <div class="detailed-analysis space-y-6">
        
        <!-- 创作背景与历史语境 -->
        ${w.background ? `
          <section class="space-y-1.5">
            <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400">
              创作背景与历史语境 (GENESIS & CONTEXT)
            </h3>
            <p class="text-xs sm:text-sm text-parchment-800 dark:text-[#D1D5DB] font-serif leading-relaxed text-justify">
              ${w.background}
            </p>
          </section>
        ` : ''}

        <!-- 美学内核与意象 -->
        ${w.aesthetic ? `
          <section class="space-y-1.5">
            <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400">
              美学内核与意象 (AESTHETIC ESSENCE)
            </h3>
            <p class="text-xs sm:text-sm text-parchment-800 dark:text-[#D1D5DB] font-serif leading-relaxed text-justify">
              ${w.aesthetic}
            </p>
          </section>
        ` : ''}

        <!-- 分乐章结构拆解与录音试听 (章节式展开，去盒去边框) -->
        <section class="pt-2">
          <div class="pb-2 mb-2 border-b border-parchment-200 dark:border-obsidian-800">
            <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-parchment-500 dark:text-zinc-400">
              ${w.movements && w.movements.length > 1 ? '分乐章结构与音乐学拆解 (MOVEMENT BREAKDOWN)' : '曲式架构与音乐学深度导赏 (ANALYSIS & SECTIONS)'}
            </h3>
          </div>
          
          <div class="divide-y divide-parchment-200/70 dark:divide-obsidian-800/70">
            ${(w.movements || []).map((m, mIdx) => {
              const hasAudio = Boolean(m.audioUrl && m.audioUrl.trim().length > 0);
              const trackData = {
                title: `${w.composerCn} · ${w.titleCn}`,
                subtitle: `${m.num ? m.num + ' ' : ''}${m.tempo}`,
                audioUrl: m.audioUrl || ''
              };
              const trackJson = encodeURIComponent(JSON.stringify(trackData));

              return `
                <section class="py-4 sm:py-5 space-y-2.5">
                  
                  <!-- 乐章标题行与录音试听按钮 -->
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex flex-wrap items-baseline gap-2 min-w-0 flex-1">
                      ${m.num ? `
                        <span class="px-2 py-0.5 rounded bg-accentGold-500/15 text-accentGold-700 dark:text-accentGold-300 font-mono text-xs font-bold shrink-0">
                          ${m.num}
                        </span>
                      ` : ''}
                      <h4 class="font-serif font-bold text-sm sm:text-base text-parchment-900 dark:text-[#F9FAFB] leading-snug">
                        ${m.tempo}
                      </h4>
                      ${m.duration ? `
                        <span class="text-[10px] sm:text-[11px] font-mono font-normal text-accentGold-700 dark:text-accentGold-400 bg-accentGold-500/10 px-2 py-0.5 rounded-full shrink-0">
                          ⏱ ${m.duration}
                        </span>
                      ` : ''}
                    </div>

                    <!-- 录音试听控制钮 (仅在有音频时常驻呈现) -->
                    ${hasAudio ? `
                      <button type="button" onclick="playMovementAudio(event, '${trackJson}')" class="px-2.5 py-1 rounded-full bg-accentGold-500/20 hover:bg-accentGold-500 text-accentGold-800 dark:text-accentGold-300 hover:text-white dark:hover:text-obsidian-950 font-sans text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 active:scale-95">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3.5v13l11-6.5-11-6.5z"/></svg>
                        <span>录音试听</span>
                      </button>
                    ` : ''}
                  </div>

                  <!-- 乐章属性参数（节拍、曲式、情态），以轻巧行展开，不加边框盒子 -->
                  ${(m.meter || m.form || m.affekt || m.duration) ? `
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-sans text-parchment-600 dark:text-zinc-400 pt-0.5">
                      ${m.meter ? `<span>节拍: <strong class="text-parchment-800 dark:text-zinc-200 font-medium">${m.meter}</strong></span>` : ''}
                      ${m.form ? `<span>曲式: <strong class="text-accentGold-700 dark:text-accentGold-300 font-medium">${m.form}</strong></span>` : ''}
                      ${m.affekt ? `<span>情态: <strong class="text-parchment-800 dark:text-zinc-200 font-serif italic">${m.affekt}</strong></span>` : ''}
                    </div>
                  ` : ''}

                  <!-- 音乐学导赏重点正文 (无内层嵌套小框，文字自由舒展) -->
                  <div class="text-xs sm:text-sm text-parchment-800 dark:text-[#E2E8F0] font-serif leading-relaxed text-justify pt-1 space-y-2">
                    ${m.highlights}
                  </div>

                </section>
              `;
            }).join('')}
          </div>
        </section>

      </div>

      <!-- 底部翻曲导航（上一曲 / 下一曲便捷通道） -->
      <nav class="flex items-center justify-between gap-3 pt-6 mt-8 border-t border-parchment-200 dark:border-obsidian-800 text-xs font-serif" aria-label="曲目翻页">
        ${wIdx > 0 ? `
          <button type="button" onclick="switchWork(${wIdx - 1})" class="px-3.5 py-2 rounded-xl border border-parchment-300 dark:border-obsidian-750 hover:border-accentGold-500/60 bg-white dark:bg-obsidian-900 text-parchment-800 dark:text-zinc-200 hover:text-accentGold-700 dark:hover:text-accentGold-400 flex items-center gap-1.5 transition-all shadow-sm active:scale-95">
            <span>←</span>
            <span class="max-w-[120px] sm:max-w-xs truncate">上一曲: ${session.works[wIdx - 1].titleCn}</span>
          </button>
        ` : '<div></div>'}

        ${wIdx < totalWorks - 1 ? `
          <button type="button" onclick="switchWork(${wIdx + 1})" class="px-3.5 py-2 rounded-xl bg-accentGold-500/15 hover:bg-accentGold-500 text-accentGold-800 dark:text-accentGold-300 hover:text-white dark:hover:text-obsidian-950 border border-accentGold-500/40 font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ml-auto">
            <span class="max-w-[120px] sm:max-w-xs truncate">下一曲: ${session.works[wIdx + 1].titleCn}</span>
            <span>→</span>
          </button>
        ` : '<div></div>'}
      </nav>

    </article>
  `;

  // 保持当前的速查模式展开/收起状态
  if (state.isCheatSheetMode) {
    document.querySelectorAll('.detailed-analysis').forEach(el => el.classList.add('hidden'));
  }
}

// Cloudflare R2 全球 CDN 加速直链基准地址（原生支持 HTTP 206 Range 分段加载与移动端 Inline 试听）
const R2_BASE_URL = 'https://pub-e1fd269f16e74a49b30607eca4df882a.r2.dev';

/**
 * 解析音频播放链接（优先通过 Cloudflare R2 全球 CDN 原生流式直连，若未配置则回退到 GitHub Releases）
 */
function resolveAudioUrl(url) {
  if (!url) return '';
  if (url.startsWith('release:')) {
    const raw = url.slice(8);
    const slashIdx = raw.indexOf('/');
    const tag = slashIdx !== -1 ? raw.slice(0, slashIdx) : 'audio-20261105-zimerman';
    const file = slashIdx !== -1 ? raw.slice(slashIdx + 1) : raw;
    
    // 优先通过 Cloudflare R2 进行无重定向、支持 iOS 分段预加载的原生播放
    if (R2_BASE_URL) {
      return `${R2_BASE_URL}/${tag}/${encodeURIComponent(file)}`;
    }
    return ['https:', '', 'github.com', 'GiovanniGuoJY', 'concert-archive', 'releases', 'download', tag, encodeURIComponent(file)].join('/');
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
  
  const directLink = document.getElementById('audioDirectLink');
  if (directLink) {
    directLink.href = resolvedUrl;
  }

  if (dom.audioElement.src !== resolvedUrl) {
    dom.audioElement.src = resolvedUrl;
    dom.audioElement.load();
  }
  
  const playPromise = dom.audioElement.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      console.warn('音频播放受限:', e);
      dom.audioTrackSubtitle.innerHTML = `${track.subtitle} · <a href="${resolvedUrl}" target="_blank" class="text-accentGold-700 dark:text-accentGold-400 underline font-semibold ml-1">新窗口播放 ↗</a>`;
      updatePlayPauseIcon(false);
    });
  }
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

  audio.onerror = (e) => {
    console.warn('音频加载受限:', audio.error);
    const directLink = document.getElementById('audioDirectLink');
    const targetUrl = (directLink && directLink.href) || dom.audioElement.src;
    dom.audioTrackSubtitle.innerHTML = `<span class="text-amber-500 font-sans text-[11px]">⚠️ 移动端在线试听受限，<a href="${targetUrl}" target="_blank" class="underline text-accentGold-600 dark:text-accentGold-400 font-bold ml-1">点此新窗口直接播放/下载 ↗</a></span>`;
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



function showEmptyState(msg) {
  dom.worksContainer.innerHTML = `
    <div class="py-16 text-center text-parchment-500 dark:text-zinc-400">
      <p class="font-serif text-base">${msg}</p>
    </div>
  `;
}

// 启动入口
window.addEventListener('DOMContentLoaded', initApp);
