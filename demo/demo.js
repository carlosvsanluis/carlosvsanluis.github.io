(function(){
  var root=document.documentElement, langBtn=document.getElementById('langBtn'), themeBtn=document.getElementById('themeBtn');
  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function applyLang(l){root.setAttribute('data-lang',l);root.lang=l;if(langBtn)langBtn.textContent=l==='en'?'FR':'EN';}
  var lang=get('lang')||'fr';
  applyLang(lang);
  if(langBtn)langBtn.onclick=function(){lang=lang==='en'?'fr':'en';applyLang(lang);set('lang',lang);};
  var theme=get('theme'); if(theme) root.setAttribute('data-theme',theme);
  var REVEAL='.card,.mod,.steps li,.diagram,.tablewrap,.pager a,.shot,.hist';

  // Fade sections in as they scroll into view (skipped when the user prefers reduced motion).
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduce && 'IntersectionObserver' in window){
    root.classList.add('anim');
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(!e.isIntersecting) return;
        e.target.classList.add('in'); io.unobserve(e.target);
        e.target.addEventListener('transitionend',function(){e.target.style.transitionDelay='';},{once:true});
        if(e.target.classList.contains('stat')) countUp(e.target.querySelector('b'));
      });
    },{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll(REVEAL).forEach(function(el){
      var i=Array.prototype.indexOf.call(el.parentNode.children,el);
      el.classList.add('reveal'); el.style.transitionDelay=(i%4)*70+'ms'; io.observe(el);
    });
  }
  // Count a key figure up from zero, keeping its prefix and suffix (e.g. "€60k", "440+").
  function countUp(b){
    var tn=b&&b.firstChild; if(!tn||tn.nodeType!==3) return;
    var m=tn.data.match(/^(\D*)(\d+)(.*)$/); if(!m) return;
    var end=+m[2], t0=null;
    function step(t){ if(!t0) t0=t; var p=Math.min(1,(t-t0)/1100);
      tn.data=m[1]+Math.round(end*(1-Math.pow(1-p,3)))+m[3]; if(p<1) requestAnimationFrame(step); }
    tn.data=m[1]+'0'+m[3]; requestAnimationFrame(step);
    setTimeout(function(){ tn.data=m[1]+end+m[3]; },1400); // final value even if animation frames are paused
  }

  // Header tightens and casts a stronger shadow once the page scrolls.
  var bar=document.querySelector('.top');
  if(bar){ var onScroll=function(){ bar.classList.toggle('scrolled',window.scrollY>8); };
    addEventListener('scroll',onScroll,{passive:true}); onScroll(); }
  if(themeBtn)themeBtn.onclick=function(){
    var dark=root.getAttribute('data-theme')==='dark';
    theme=dark?'light':'dark';root.setAttribute('data-theme',theme);set('theme',theme);
  };
})();
