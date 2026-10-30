(function(){
  var root=document.documentElement, langBtn=document.getElementById('langBtn'), themeBtn=document.getElementById('themeBtn');
  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function applyLang(l){root.setAttribute('data-lang',l);root.lang=l;if(langBtn)langBtn.textContent=l==='en'?'FR':'EN';}
  var lang=get('lang')||((navigator.language||'en').toLowerCase().indexOf('fr')===0?'fr':'en');
  applyLang(lang);
  if(langBtn)langBtn.onclick=function(){lang=lang==='en'?'fr':'en';applyLang(lang);set('lang',lang);};
  var theme=get('theme'); if(theme) root.setAttribute('data-theme',theme);
  if(themeBtn)themeBtn.onclick=function(){
    var dark=root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);
    theme=dark?'light':'dark';root.setAttribute('data-theme',theme);set('theme',theme);
  };
})();
