const assetBase = 'https://758445d4.berlin-monitor-scene.pages.dev/84d7573f/';
const originalSite = 'https://felixrieseberg.com/';

function showFallback() {
  document.querySelector('#bm-root').hidden = true;
  document.querySelector('#room-fallback').hidden = false;
  return true;
}

window.__BM = {
  page: 'home',
  assetBase,
  openPost: post => window.open(new URL(post.u, originalSite), '_blank', 'noopener'),
  plain: showFallback,
};

window.addEventListener('click', event => {
  // The room's entry gate catches clicks at window level. Keep the exit usable during the gate.
  if (event.target.closest('.room-exit')) event.stopImmediatePropagation();
}, true);

// Keep article links on the original site, including links opened in a new tab.
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-post], #plink');
  if (link) link.href = new URL(link.getAttribute('href'), originalSite).href;
}, true);

import('./runtime/desktop.js').catch(error => {
  console.error('Interactive room failed to start', error);
  showFallback();
});
