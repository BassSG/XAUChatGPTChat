const routes = {
  overview: ['overview', 'home'],
  analysis: ['plan', 'conditions'],
  'scenario-plan': ['plan', 'sequence'],
  'indicator-card': ['plan', 'evidence'],
  'plan-image': ['plan', 'image'],
  'report-body': ['plan', 'full'],
  news: ['news', 'news'],
  'market-chart': ['chart', 'live'],
  chart: ['chart', 'snapshot'],
  history: ['history', 'history'],
  notifications: ['settings', 'settings']
};

export function workspaceRoute(hash) {
  const key = String(hash || '').replace(/^#/, '');
  const [page, view] = Object.hasOwn(routes, key) ? routes[key] : routes.overview;
  return { page, view };
}

const byId = id => document.getElementById(id);

export function setupWorkspaceDesk() {
  const media = window.matchMedia('(min-width: 651px)');
  const destinations = {
    overview: '#overview', plan: '#analysis', news: '#news',
    chart: '#market-chart', history: '#history', settings: '#notifications'
  };
  const headings = {
    plan: ['แผนล่าสุด', 'เลือกดูเงื่อนไข ภาพสรุป หรือหลักฐานของรายงานรอบเดียวกัน'],
    news: ['ข่าวและบริบท', 'ดูข่าวที่เกี่ยวข้องกับแผนก่อนใช้เงื่อนไขราคา'],
    chart: ['กราฟราคา', 'สลับระหว่างกราฟตลาดกับกราฟตามรายงาน'],
    history: ['รายงานย้อนหลัง', 'เปิดรายงานเก่าเพื่อทบทวนแผนและหลักฐาน'],
    settings: ['ตั้งค่าแอป', 'จัดการการแจ้งเตือนและการแสดงผล']
  };
  const show = (selector, visible) => document.querySelectorAll(selector).forEach(element =>
    element.classList.toggle('workspace-route-hidden', !visible));

  const apply = (resetScroll = true) => {
    const active = media.matches;
    document.body.classList.toggle('workspace-app', active);
    byId('workspace-page-heading').hidden = !active || workspaceRoute(location.hash).page === 'overview';
    if (!active) return;

    const { page, view } = workspaceRoute(location.hash);
    document.body.dataset.workspacePage = page;
    document.body.dataset.workspaceView = view;
    show('#overview, #overview-location, .section-heading, #mobile-home', page === 'overview');
    show('#analysis', page === 'plan' && view !== 'sequence');
    show('#scenario-plan, #mobile-sequence-empty', page === 'plan' && view === 'sequence');
    show('.desk-rail', page === 'news' || page === 'settings');
    show('#news, .context-panel', page === 'news');
    show('#notifications', page === 'settings');
    show('#market-chart', page === 'chart' && view === 'live');
    show('#chart', page === 'chart' && view === 'snapshot');
    show('#history', page === 'history');
    show('#workspace-plan-nav', page === 'plan');
    show('#workspace-chart-nav', page === 'chart');
    show('.footer', page === 'overview');

    if (page === 'settings') document.querySelector('.settings-details').open = true;
    if (page === 'plan') {
      const full = document.querySelector('.full-analysis');
      if (full) full.open = view === 'full';
    }
    if (page !== 'overview') {
      const [title, description] = headings[page];
      byId('workspace-page-title').textContent = title;
      byId('workspace-page-description').textContent = description;
    }
    document.querySelectorAll('.nav-link, .tablet-nav-link').forEach(link => {
      const selected = link.getAttribute('href') === destinations[page];
      link.classList.toggle('selected', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('.workspace-subnav a').forEach(link => {
      const selected = link.hash === location.hash || (!location.hash && link.hash === '#analysis');
      link.classList.toggle('selected', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    window.dispatchEvent(new CustomEvent('xau:route', { detail: { page, view } }));
  };

  window.addEventListener('hashchange', () => apply());
  media.addEventListener('change', () => apply());
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (media.matches && link && location.hash === link.hash) apply();
  });
  apply(false);
}
