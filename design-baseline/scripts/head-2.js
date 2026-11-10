
(function(){
  var D = document.documentElement, P = {}, R = {};
  try{ P = JSON.parse(localStorage.getItem('maktabati:profile') || '{}') || {}; R = P.read || {}; }catch(e){}
  function g(k){ try{ var v = localStorage.getItem('reader:' + k); if (v !== null) return JSON.parse(v); }catch(e){} return R[k] == null ? null : R[k]; }
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  try{
    D.dataset.theme = (R.theme === 'auto' ? null : g('theme')) || (dark ? 'dark' : 'light');
    var d = g('fs'); if (d != null) D.style.setProperty('--fs-delta', d);
    if (/^#\/read\//.test(location.hash)) D.classList.add('in-read');
    var lg = localStorage.getItem('reader:lang'); if (lg && JSON.parse(lg) === 'en'){ D.lang = 'en'; D.dir = 'ltr'; }
    var sd = localStorage.getItem('reader:side'); if (sd && JSON.parse(sd) === 'closed') D.classList.add('side-closed');
    ['font','lh','width'].forEach(function(k){ var v = g(k); if (v) D.dataset[k] = v; });
  }catch(e){ D.dataset.theme = dark ? 'dark' : 'light'; }
})();
