/**
 * 音乐会研习文库 - 首页展示驱动
 * Concert Repertoire Archive - Homepage Driver
 */

const homeState = {
  concertIndex: [],
  activeFilter: 'all', // 'all' | 'upcoming' | 'past'
  fontSize: 'standard'
};

const FONT_SIZES = [
  { id: 'standard', label: '标准', size: '16px' },
  { id: 'medium', label: '放大', size: '18px' },
  { id: 'large', label: '特大', size: '20px' }
];

async function initHome() {
  initTheme();
  initFontSize();

  try {
    // 优先读取本地注入数据 (兼容 Finder 本地双击 file:// 打开)
    if (window.__CONCERTS_INDEX__ && Array.isArray(window.__CONCERTS_INDEX__) && window.__CONCERTS_INDEX__.length > 0) {
      homeState.concertIndex = window.__CONCERTS_INDEX__;
    } else {
      const res = await fetch('data/concerts-index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} 加载索引失败`);
      homeState.concertIndex = await res.json();
    }

    renderHomepage();
  } catch (err) {
    console.error('首页加载失败:', err);
    document.getElementById('homeContent').innerHTML = `
      <div class="py-16 text-center text-red-500 font-serif">
        <p>数据加载异常: ${err.message}</p>
      </div>
    `;
  }
}

function renderHomepage() {
  const container = document.getElementById('homeContent');
  if (!container) return;

  // 1. 待演出（按时间正序排列，距离当前最近的排期在前）
  const upcomingList = homeState.concertIndex
    .filter(c => c.status !== 'past')
    .sort((a, b) => {
      const keyA = (a.dateIso || a.date || '').replace(/[^0-9]/g, '');
      const keyB = (b.dateIso || b.date || '').replace(/[^0-9]/g, '');
      return keyA.localeCompare(keyB);
    });

  // 2. 历史演出（按时间倒序排列，最新结束的演出在前）
  const pastList = homeState.concertIndex
    .filter(c => c.status === 'past')
    .sort((a, b) => {
      const keyA = (a.dateIso || a.date || '').replace(/[^0-9]/g, '');
      const keyB = (b.dateIso || b.date || '').replace(/[^0-9]/g, '');
      return keyB.localeCompare(keyA);
    });

  const showUpcoming = homeState.activeFilter === 'all' || homeState.activeFilter === 'upcoming';
  const showPast = homeState.activeFilter === 'all' || homeState.activeFilter === 'past';

  container.innerHTML = `
    <!-- 模块一：待演音乐会 -->
    ${showUpcoming ? `
      <section id="upcomingSection" class="space-y-3.5 mb-9">
        <div class="flex items-center justify-between pb-2.5 border-b border-parchment-200 dark:border-obsidian-800">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-accentGold-500 shrink-0"></span>
            <h2 class="text-base sm:text-lg font-serif font-bold text-parchment-900 dark:text-zinc-100 truncate">
              待演音乐会
            </h2>
            <span class="text-[10px] font-mono tracking-widest uppercase text-parchment-400 dark:text-zinc-500 shrink-0">
              UPCOMING
            </span>
          </div>
          <span class="text-xs font-mono text-parchment-500 dark:text-zinc-400 font-medium shrink-0">
            ${upcomingList.length} 场演出
          </span>
        </div>

        <div class="grid grid-cols-1 gap-3.5">
          ${upcomingList.map(c => renderConcertCard(c, false)).join('')}
        </div>
      </section>
    ` : ''}

    <!-- 模块二：历史演出档案 -->
    ${showPast ? `
      <section id="pastSection" class="space-y-3.5 mb-9">
        <div class="flex items-center justify-between pb-2.5 border-b border-parchment-200 dark:border-obsidian-800">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600 shrink-0"></span>
            <h2 class="text-base sm:text-lg font-serif font-bold text-parchment-900 dark:text-zinc-100 truncate">
              历史演出档案
            </h2>
            <span class="text-[10px] font-mono tracking-widest uppercase text-parchment-400 dark:text-zinc-500 shrink-0">
              HISTORICAL
            </span>
          </div>
          <span class="text-xs font-mono text-parchment-500 dark:text-zinc-400 font-medium shrink-0">
            ${pastList.length} 场档案
          </span>
        </div>

        <div class="grid grid-cols-1 gap-3.5">
          ${pastList.map(c => renderConcertCard(c, true)).join('')}
        </div>
      </section>
    ` : ''}
  `;
}

/**
 * 渲染单张音乐会卡片（优化小屏幕横向对齐与换行布局）
 */
function renderConcertCard(c, isPast) {
  return `
    <a href="detail.html?id=${c.id}" class="block group rounded-2xl bg-white dark:bg-obsidian-900 border border-parchment-200 dark:border-obsidian-800 p-4 sm:p-5 card-shadow hover:border-accentGold-500/60 dark:hover:border-accentGold-500/60 transition-all active:scale-[0.99]">
      
      <!-- 卡片顶栏：日期、场馆与录音标识 -->
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
            isPast
              ? 'bg-parchment-200/80 dark:bg-obsidian-800 text-parchment-700 dark:text-zinc-300'
              : 'bg-accentGold-500/15 text-accentGold-800 dark:text-accentGold-300 border border-accentGold-500/30'
          }">
            📅 ${c.date}
          </span>
          <span class="text-xs text-parchment-500 dark:text-zinc-400 font-sans">
            📍 ${c.venue}
          </span>
        </div>
        ${c.hasAudio ? `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            🎧 含 ${c.audioCount || ''} 轨现场录音
          </span>
        ` : ''}
      </div>

      <!-- 音乐会标题与副标题 -->
      <div class="mb-2.5">
        <h3 class="text-base sm:text-lg font-serif font-bold text-parchment-900 dark:text-[#F3F4F6] group-hover:text-accentGold-700 dark:group-hover:text-accentGold-400 transition-colors leading-snug">
          ${c.title}
        </h3>
        ${c.subTitle ? `
          <p class="font-serif italic text-xs text-parchment-500 dark:text-zinc-400 mt-0.5 leading-normal">
            ${c.subTitle}
          </p>
        ` : ''}
      </div>

      <!-- 演出阵容 -->
      <div class="text-xs text-parchment-700 dark:text-zinc-300 font-sans flex items-start gap-1.5 mb-3 pt-2 border-t border-parchment-100 dark:border-obsidian-800/80">
        <span class="text-[10px] font-mono uppercase font-bold text-accentGold-700 dark:text-accentGold-400 shrink-0 mt-0.5">阵容:</span>
        <span class="font-medium leading-relaxed">${c.featuredArtist || ''}</span>
      </div>

      <!-- 曲目清单胶囊 -->
      ${c.programTags && c.programTags.length > 0 ? `
        <div class="mb-3">
          <div class="flex flex-wrap gap-1.5">
            ${c.programTags.map(tag => `
              <span class="px-2 py-0.5 rounded-md bg-parchment-100/90 dark:bg-obsidian-850 text-parchment-800 dark:text-zinc-300 text-[11px] font-serif border border-parchment-200/60 dark:border-obsidian-800 flex items-center gap-1">
                <span class="text-accentGold-600 dark:text-accentGold-400 font-serif">§</span>
                <span>${tag}</span>
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- 卡片底栏：曲目数与进入正文入口（水平对齐） -->
      <div class="pt-2.5 border-t border-parchment-100 dark:border-obsidian-800/80 flex items-center justify-between text-xs font-serif">
        <span class="text-parchment-500 dark:text-zinc-400 font-mono text-[11px]">
          共 ${c.worksCount || (c.programTags ? c.programTags.length : '')} 部作品
        </span>
        <span class="inline-flex items-center gap-1 font-semibold text-accentGold-700 dark:text-accentGold-400 group-hover:translate-x-1 transition-transform">
          <span>进入研习正文</span>
          <span>→</span>
        </span>
      </div>

    </a>
  `;
}

function setFilter(filter) {
  homeState.activeFilter = filter;
  ['filterAll', 'filterUpcoming', 'filterPast'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = el.dataset.filter === filter
      ? 'px-3.5 py-1.5 rounded-lg text-xs font-serif font-bold bg-accentGold-500/20 text-accentGold-700 dark:text-accentGold-300 border border-accentGold-500/50 shadow-sm transition-all'
      : 'px-3.5 py-1.5 rounded-lg text-xs font-serif text-parchment-600 dark:text-zinc-400 hover:bg-parchment-200/60 dark:hover:bg-obsidian-800 border border-transparent transition-all';
  });
  renderHomepage();
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
  homeState.fontSize = target.id;
  document.documentElement.setAttribute('data-font-size', target.id);
  document.documentElement.style.fontSize = target.size;
  const label = document.getElementById('fontSizeLabel');
  if (label) {
    label.textContent = target.label;
  }
  localStorage.setItem('concert_archive_font_size', target.id);
}

function cycleFontSize() {
  const currentIdx = FONT_SIZES.findIndex(f => f.id === homeState.fontSize);
  const nextIdx = (currentIdx + 1) % FONT_SIZES.length;
  setFontSize(FONT_SIZES[nextIdx].id);
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

window.addEventListener('DOMContentLoaded', initHome);
