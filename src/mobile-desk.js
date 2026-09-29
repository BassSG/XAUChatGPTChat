// Mobile destinations use URL fragments, so back/forward and shared links work.
const routes = {
  overview: ['home', ''], analysis: ['plan', 'conditions'],
  'scenario-plan': ['plan', 'sequence'], 'plan-image': ['plan', 'image'],
  'indicator-card': ['plan', 'evidence'], 'report-body': ['plan', 'full'],
  news: ['news', ''], chart: ['chart', 'snapshot'],
  'market-chart': ['chart', 'live'], history: ['history', ''], notifications: ['settings', '']
};
export function mobileRoute(hash) {
  const key = String(hash || '').replace(/^#/, '');
  const [page, view] = Object.hasOwn(routes, key) ? routes[key] : routes.overview;
  return { page, view };
}
const byId = id => document.getElementById(id);
let applyRoute = () => {};
const copy = (target, source) => { byId(target).textContent = byId(source).textContent; };

export function refreshMobileDesk() {
  if (!byId('mobile-home')) return;
  copy('mobile-headline', 'report-title');
  copy('mobile-status', 'bias-pill');
  copy('mobile-summary', 'report-summary');
  copy('mobile-wait', 'report-wait');
  copy('mobile-news', 'news-brief-text');
  copy('mobile-freshness', 'report-freshness');
  copy('mobile-state', 'report-state-title');
  byId('mobile-status').className = byId('bias-pill').className;
  byId('mobile-home').classList.toggle('has-report', !byId('report-content').hidden);
  byId('mobile-image-empty').hidden = !byId('report-image-link').hidden;
  byId('mobile-news').textContent ||= 'ยังไม่มีรายการข่าวที่ตรวจสอบได้';
  byId('mobile-wait').textContent ||= 'รอรายงานรอบถัดไป';
  const cards = [...document.querySelectorAll('.sequence-card')];
  byId('mobile-sequence-empty').hidden = cards.length > 0;
  const picker = byId('mobile-side-picker');
  const selected = picker.querySelector('[aria-pressed="true"]')?.dataset.side || cards[0]?.dataset.side;
  picker.replaceChildren(...cards.map(card => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.side = card.dataset.side;
    button.textContent = card.dataset.side === 'BUY' ? 'ฝั่งซื้อ' : 'ฝั่งขาย';
    button.setAttribute('aria-pressed', String(card.dataset.side === selected));
    button.addEventListener('click', () => {
      picker.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      cards.forEach(c => c.classList.toggle('mobile-side-hidden', c !== card));
    });
    card.classList.toggle('mobile-side-hidden', card.dataset.side !== selected);
    return button;
  }));
  applyRoute(false);
}

export function setupMobileDesk() {
  const media = window.matchMedia('(max-width: 650px)');
  const show = (selector, yes) => document.querySelectorAll(selector).forEach(el => el.classList.toggle('mobile-route-hidden', !yes));
  const groups = {
    conditions: '.plan-grid, #report-wait-card, #readiness-card',
    image: '#report-image-link, #mobile-image-empty',
    evidence: '#indicator-card, #report-change-card, #prior-review-card, #weekly-review-card',
    full: '.full-analysis, .source-details, #report-validity'
  };
  // Keep financial details available, but only expand the chosen topic on a phone.
  const syncConditionals = () => document.querySelectorAll('.plan-cell').forEach((cell, i) => {
    let details = cell.querySelector(':scope > .mobile-condition');
    if (media.matches && !details) {
      const label = cell.querySelector(':scope > small');
      if (!label) return;
      details = document.createElement('details'); details.className = 'mobile-condition';
      const summary = document.createElement('summary'); summary.textContent = label.textContent;
      label.remove(); details.append(summary, ...cell.childNodes); cell.append(details);
    } else if (!media.matches && details) {
      const summary = details.querySelector(':scope > summary');
      const label = document.createElement('small'); label.textContent = summary.textContent;
      const children = [...details.childNodes].filter(node => node !== summary);
      details.replaceWith(label, ...children);
      details = null;
    }
    if (details) details.open = !media.matches || i === 1 || i === 2;
  });
  syncConditionals();
  document.querySelectorAll('.full-analysis').forEach(el => { el.open = !media.matches; });
  applyRoute = (resetScroll = true) => {
    const { page, view } = mobileRoute(location.hash);
    document.body.classList.toggle('mobile-app', media.matches);
    document.body.dataset.mobilePage = page;
    document.body.dataset.mobileView = view;
    show('#mobile-home', page === 'home');
    show('#mobile-plan-nav', page === 'plan');
    show('#mobile-chart-nav', page === 'chart');
    show('#analysis', page === 'plan' && view !== 'sequence');
    show('#scenario-plan, #mobile-side-picker, #mobile-sequence-empty', page === 'plan' && view === 'sequence');
    show('.desk-rail', page === 'news' || page === 'settings');
    show('#news, .context-panel', page === 'news');
    show('#notifications', page === 'settings');
    if (page === 'settings') document.querySelector('.settings-details').open = true;
    show('#chart', page === 'chart' && view === 'snapshot');
    show('#market-chart', page === 'chart' && view === 'live');
    show('#history', page === 'history');
    show('#news-brief, #report-summary', false);
    for (const [name, selector] of Object.entries(groups)) show(selector, view === name);
    const titles = {home:'ภาพรวมวันนี้',plan:'แผนการเทรด',news:'ข่าวและบริบท',chart:'กราฟราคา',history:'รายงานย้อนหลัง',settings:'ตั้งค่าแอป'};
    byId('mobile-page-title').textContent = titles[page];
    document.querySelectorAll('.mobile-bottom-nav a, .mobile-subnav a').forEach(link => {
      const destination = mobileRoute(link.hash);
      const selected = link.closest('.mobile-subnav') ? destination.view === view && destination.page === page : destination.page === page;
      link.classList.toggle('selected', selected);
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (media.matches && resetScroll) {
      if (view === 'full') document.querySelector('.full-analysis').open = true;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.dispatchEvent(new CustomEvent('xau:route', { detail: { page, view } }));
  };
  window.addEventListener('hashchange', () => applyRoute());
  window.addEventListener('load', () => { if (media.matches) window.scrollTo({ top: 0, behavior: 'instant' }); }, { once: true });
  media.addEventListener('change', () => {
    syncConditionals();
    document.querySelectorAll('.full-analysis, #report-body .analysis-section').forEach(el => { el.open = !media.matches; });
    applyRoute();
  });
  // Native hash navigation cannot find every subview ID and can jump below its tabs.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!media.matches || !link || !routes[link.hash.slice(1)]) return;
    event.preventDefault();
    if (location.hash === link.hash) applyRoute(); else location.hash = link.hash;
  });
  refreshMobileDesk();
}
