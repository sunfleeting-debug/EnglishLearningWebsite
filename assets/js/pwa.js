/* Install/update bridge for browsers that expose PWA lifecycle events. */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  var deferred = null;
  var updateRegistration = null;

  function button() {
    var existing = document.getElementById('pwa-install');
    if (existing) return existing;
    var b = document.createElement('button');
    b.id = 'pwa-install'; b.className = 'pwa-action'; b.type = 'button';
    b.hidden = true; b.textContent = '安装到手机'; b.title = '安装英语学习站到主屏幕';
    document.body.appendChild(b);
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; b.hidden = true; });
    });
    return b;
  }
  function showUpdate(registration) {
    updateRegistration = registration;
    if (document.getElementById('pwa-update')) return;
    var b = document.createElement('button');
    b.id = 'pwa-update'; b.className = 'pwa-action pwa-update'; b.type = 'button';
    b.textContent = '有新版本，刷新'; b.title = '安装最新版本';
    document.body.appendChild(b);
    b.addEventListener('click', function () {
      b.disabled = true;
      if (updateRegistration.waiting) updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });
  }
  function register() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js').then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration);
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration);
        });
      });
    }).catch(function () { /* local file:// and restricted browsers simply keep web behavior */ });
    // 首次访问：页面加载时本无 controller，资源都是网络拉的新版，
    // claim() 接管不需要 reload（reload 会中断原始导航，产生 net::ERR_ABORTED）。
    // 只有「更新版 SW 接管」才需要刷新拿到新 shell。
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      window.location.reload();
    });
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); deferred = event;
    var b = button(); b.hidden = false;
  });
  window.addEventListener('appinstalled', function () { deferred = null; var b = button(); b.hidden = true; });
  window.addEventListener('online', function () { document.documentElement.classList.remove('is-offline'); });
  window.addEventListener('offline', function () { document.documentElement.classList.add('is-offline'); });
  if (!navigator.onLine) document.documentElement.classList.add('is-offline');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
  TW.pwa = { register: register, button: button };
})();
