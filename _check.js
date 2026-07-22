
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };
  var root = document.documentElement;

  /* ---------- data ---------- */
  function seed(){
    return [
      {t:"Welcome to CutCap.", a:0, b:2400},
      {t:"Click the slash between words to split a caption.", a:2400, b:6000},
      {t:"Double-click a word to fix it.", a:6000, b:8600},
      {t:"Flag a line to revisit it later.", a:8600, b:11000},
      {t:"Undo and redo have your back.", a:11000, b:13200},
      {t:"Then push them straight back to your timeline.", a:13200, b:15600}
    ].map(function(c){ return {id:uid(), text:c.t, start:c.a, end:c.b, flagged:false, note:""}; });
  }
  var HISTORY = [
    {name:"Reels 1_v4.srt", prev:"were saying it's close", meta:"1 line · 2d ago"},
    {name:"Cutcap Demo RAW.srt", prev:"hey all this is a quick demo of what cutcap does", meta:"53 lines · 5d ago"},
    {name:"Interview_captions.srt", prev:"so when did you first start editing", meta:"12 lines · 6d ago"},
    {name:"C0768_v5.srt", prev:"it's like a", meta:"51 lines · 7/10/2026"}
  ];
  var PRESETS = ["#f03d13","#1476de","#8b5cf6","#12b886","#e8590c","#e64980","#f59f00","#495057"];

  var _n=0; function uid(){ return "c"+(++_n)+"_"+Math.random().toString(36).slice(2,6); }

  var caps = seed(), selId=null, dirty=false, editing=null, syncOn=false;
  var undoStack=[], redoStack=[];
  var findQuery="", findCase=false, findWord=false, curMatch=0, matchTotal=0;

  var listEl=$('list'), hintEl=$('hint'), toastsEl=$('toasts');

  /* ---------- helpers ---------- */
  function clone(a){ return a.map(function(c){ return {id:c.id,text:c.text,start:c.start,end:c.end,flagged:c.flagged,note:c.note}; }); }
  function words(t){ return t.replace(/\n/g,' ').trim().split(/\s+/).filter(Boolean); }
  function fmt(ms){ var h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),mm=Math.floor(ms%1000);
    function p(n,w){n=""+n;while(n.length<w)n="0"+n;return n;} return p(h,2)+":"+p(m,2)+":"+p(s,2)+","+p(mm,3); }
  function esc(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function find(id){ for(var i=0;i<caps.length;i++) if(caps[i].id===id) return caps[i]; return null; }
  function indexOf(id){ for(var i=0;i<caps.length;i++) if(caps[i].id===id) return i; return -1; }

  /* ---------- history stack ---------- */
  function snapshot(){ undoStack.push(clone(caps)); if(undoStack.length>80) undoStack.shift(); redoStack.length=0; dirty=true; }
  function undo(){ if(!undoStack.length){toast("Nothing to undo");return;} redoStack.push(clone(caps)); caps=undoStack.pop(); selId=null; render(); toast("Undo",'ok'); }
  function redo(){ if(!redoStack.length){toast("Nothing to redo");return;} undoStack.push(clone(caps)); caps=redoStack.pop(); selId=null; render(); toast("Redo",'ok'); }

  /* ---------- edits ---------- */
  function delCap(id){ snapshot(); caps=caps.filter(function(c){return c.id!==id;}); if(selId===id)selId=null; render(); toast("Line deleted",'ok'); }
  function flagCap(id){ var c=find(id); if(!c)return; snapshot(); c.flagged=!c.flagged; if(!c.flagged)c.note=""; selId=id; render(); }
  function splitAfter(id, after){ var i=indexOf(id); if(i<0)return; var c=caps[i], ws=words(c.text);
    if(after<0||after>=ws.length-1)return; snapshot();
    var t1=ws.slice(0,after+1).join(' '), t2=ws.slice(after+1).join(' ');
    var frac=t1.length/(t1.length+t2.length), mid=Math.round(c.start+(c.end-c.start)*frac);
    caps.splice(i,1,{id:uid(),text:t1,start:c.start,end:mid,flagged:c.flagged,note:c.note},{id:uid(),text:t2,start:mid,end:c.end,flagged:false,note:""});
    selId=caps[i+1].id; render(); toast("Caption split",'ok'); }
  function mergeNext(id){ var i=indexOf(id); if(i<0||i>=caps.length-1)return; snapshot();
    var a=caps[i],b=caps[i+1]; a.text=(a.text+' '+b.text).replace(/\s+/g,' ').trim(); a.end=b.end; a.flagged=a.flagged||b.flagged;
    caps.splice(i+1,1); selId=a.id; render(); toast("Lines merged",'ok'); }
  function mergeWords(id, after){ var c=find(id); if(!c)return; var ws=words(c.text); if(after<0||after>=ws.length-1)return;
    snapshot(); ws.splice(after,2,ws[after]+ws[after+1]); c.text=ws.join(' '); render(); }
  function commitWord(id, wIndex, newText){ var c=find(id); if(!c)return; var ws=words(c.text);
    newText=newText.replace(/\s+/g,' ').trim(); if(wIndex<0||wIndex>=ws.length)return; if(newText===ws[wIndex])return;
    snapshot(); if(newText==="")ws.splice(wIndex,1); else ws.splice(wIndex,1,newText); c.text=ws.join(' ');
    if(!c.text){ caps=caps.filter(function(x){return x.id!==id;}); toast("Line deleted",'ok'); } render(); }
  function commitNote(id, txt){ var c=find(id); if(!c)return; c.note=txt.trim(); dirty=true; }

  /* ---------- cleanup ---------- */
  function cleanup(kind){ if(!caps.length)return; snapshot();
    if(kind==='gaps'){ for(var i=0;i<caps.length-1;i++) caps[i].end=caps[i+1].start; toast("Gaps removed",'ok'); }
    else if(kind==='breaks'){ caps.forEach(function(c){ c.text=c.text.replace(/\s*\n\s*/g,' ').replace(/\s+/g,' ').trim(); }); toast("Line breaks removed",'ok'); }
    else if(kind==='punct'){ caps.forEach(function(c){ c.text=c.text.replace(/[.,!?;:—–"“”'’]/g,'').replace(/\s+/g,' ').trim(); }); toast("Punctuation removed",'ok'); }
    render(); }

  /* ---------- find & replace ---------- */
  function findRegex(g){ if(!findQuery)return null; var q=findQuery.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(findWord)q='\\b'+q+'\\b'; return new RegExp(q,(g?'g':'')+(findCase?'':'i')); }
  function runFind(){ // recount + render
    matchTotal=0; if(findQuery){ var re=findRegex(true); caps.forEach(function(c){ var m=c.text.match(re); if(m)matchTotal+=m.length; }); }
    if(curMatch>=matchTotal)curMatch=0; render(); updateFindCount(); }
  function updateFindCount(){ $('findCount').textContent=(matchTotal?curMatch+1:0)+"/"+matchTotal; }
  function stepMatch(d){ if(!matchTotal)return; curMatch=(curMatch+d+matchTotal)%matchTotal; render(); updateFindCount();
    var cur=listEl.querySelector('mark.current'); if(cur)cur.scrollIntoView({block:'nearest'}); }
  function replaceAll(){ if(!findQuery||!matchTotal)return; var rep=$('replaceInput').value; snapshot();
    var re=findRegex(true); var n=matchTotal; caps.forEach(function(c){ c.text=c.text.replace(re,rep); }); curMatch=0; runFind();
    toast("Replaced "+n+" match"+(n===1?"":"es"),'ok'); }

  /* ---------- toolbar actions ---------- */
  function doImport(){ var run=function(){ caps=seed(); selId=null; undoStack.length=0; redoStack.length=0; dirty=false; clearFind(); render(); toast("Imported demo.srt",'ok'); };
    if(dirty){ toast("Changes saved",'ok'); setTimeout(run,1050); } else run(); }
  function doExport(){ if(!caps.length)return; toast("Exported "+caps.length+" captions to SRT",'ok'); }
  function doPush(){ if(!caps.length)return; toast("Pushed "+caps.length+" captions to the timeline",'ok'); dirty=false; }
  function toggleSync(){ syncOn=!syncOn; var b=$('btnSync'); b.classList.toggle('on',syncOn); b.title="Sync: "+(syncOn?"ON":"OFF");
    toast(syncOn?"Sync on — follows the Premiere timeline":"Sync off",syncOn?'ok':null); }

  /* ---------- toast — ONE at a time, replaced in the same spot ---------- */
  var toastTimer=null;
  function toast(msg, kind){
    toastsEl.innerHTML='';                 // drop any existing toast immediately
    if(toastTimer){ clearTimeout(toastTimer); toastTimer=null; }
    var el=document.createElement('div'); el.className='toast '+(kind||'');
    el.innerHTML='<span class="tdot"></span>'+esc(msg); toastsEl.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('show'); });
    toastTimer=setTimeout(function(){ el.classList.remove('show'); setTimeout(function(){ if(el.parentNode)el.remove(); },200); }, 2400);
  }

  /* ---------- render ---------- */
  function highlight(text){ // used when a find query is active
    var re=findRegex(true); var out='', last=0, m, gi=window.__gi;
    re.lastIndex=0;
    while((m=re.exec(text))!==null){
      out+=esc(text.slice(last,m.index));
      var isCur=(window.__gi===curMatch);
      out+='<mark class="match'+(isCur?' current':'')+'">'+esc(m[0])+'</mark>';
      window.__gi++; last=m.index+m[0].length;
      if(m[0]===''){ re.lastIndex++; }
    }
    out+=esc(text.slice(last)); return out;
  }
  function wordBody(c){
    var ws=words(c.text), body='';
    for(var w=0;w<ws.length;w++){
      body+='<span class="word" data-id="'+c.id+'" data-w="'+w+'">'+esc(ws[w])+'</span>';
      if(w<ws.length-1) body+='<span class="word-divider" data-id="'+c.id+'" data-after="'+w+'" title="Click to split · Alt-click to merge the two words">/</span>';
    }
    return body;
  }
  function render(){
    editing=null;
    $('btnUndo').disabled=!undoStack.length; $('btnRedo').disabled=!redoStack.length;
    $('btnExport').disabled=!caps.length; $('btnPush').disabled=!caps.length;
    Array.prototype.forEach.call(document.querySelectorAll('.cleanup-btn'),function(b){ b.disabled=!caps.length; });
    $('count').textContent=caps.length+(caps.length===1?" caption":" captions");

    if(!caps.length){
      listEl.innerHTML='<div class="empty"><svg class="cutcap-logo" viewBox="0 0 1249.94 610.87"><path d="M168.74,549.45L0,610.87v-155.93l168.74-61.42v155.93ZM168.74,61.42L0,0v155.93l168.74,61.42V61.42ZM1081.2,61.42v155.93l168.74-61.42V0l-168.74,61.42ZM1081.2,549.45l168.74,61.42v-155.93l-168.74-61.42v155.93ZM712.68,195.55l214.2,77.96,91.82-33.42V84.16l-306.02,111.38ZM536.69,195.34L231.24,84.16v155.93l91.24,33.21,214.2-77.96ZM993.12,361.72l-336.9-122.62v155.68l362.48,131.93v-155.93l-25.58-9.31v.25ZM410.54,305.35l.23.08-179.53,65.34v155.93l362.48-131.93v-156.1l-183.19,66.67Z" fill="currentColor"/></svg><p>Import a caption file to get started</p><p class="sub">or drag and drop a .srt, .vtt, or .csv file here</p></div>';
      return;
    }
    window.__gi=0;
    var html='';
    caps.forEach(function(c,i){
      var sel=c.id===selId?' sel':'', fl=c.flagged?' flagged':'';
      var body=findQuery?highlight(c.text):wordBody(c);
      html+='<div class="cap'+sel+fl+'" data-id="'+c.id+'">'+
        '<span class="bar"></span>'+
        '<div class="chead"><span class="idx">'+(i+1)+'</span>'+
          '<div class="tc">'+fmt(c.start)+'<span class="arr">&rarr;</span>'+fmt(c.end)+'</div>'+
          '<div class="row-actions">'+
            '<button class="mini flag" data-act="flag" data-id="'+c.id+'" title="Flag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4h13l-2 4 2 4H4"/></svg></button>'+
            '<button class="mini del" data-act="del" data-id="'+c.id+'" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>'+
          '</div></div>'+
        '<div class="txt">'+body+'</div>'+
        (c.flagged?'<div class="note" contenteditable="true" data-id="'+c.id+'" data-ph="Add a review note…">'+esc(c.note||'')+'</div>':'')+
        '</div>';
    });
    listEl.innerHTML=html;
  }

  /* ---------- word edit ---------- */
  function startEdit(span){ editing={capId:span.getAttribute('data-id'),wIndex:Number(span.getAttribute('data-w'))}; selId=editing.capId;
    span.setAttribute('contenteditable','true'); span.focus();
    var r=document.createRange(); r.selectNodeContents(span); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    hintEl.textContent="Enter to save · Esc to cancel"; }

  /* ---------- overlays ---------- */
  function closeAll(except){ ['appMenu','historyPanel','findBar'].forEach(function(id){ if(id!==except)$(id).hidden=true; });
    $('btnFind').classList.toggle('on', except==='findBar'); }
  function toggle(id){ var el=$(id), willShow=el.hidden; closeAll(willShow?id:null); el.hidden=!willShow; return willShow; }

  /* ---------- find open/close ---------- */
  function openFind(){ if(toggle('findBar')){ $('findInput').focus(); } else clearFind(); }
  function clearFind(){ findQuery=""; $('findInput').value=""; curMatch=0; matchTotal=0; $('findBar').hidden=true; $('btnFind').classList.remove('on'); render(); }

  /* ---------- history ---------- */
  function buildHistory(){ var h=''; HISTORY.forEach(function(x,i){ h+='<div class="hitem" data-h="'+i+'"><div class="hname">'+esc(x.name)+'</div><div class="hprev">'+esc(x.prev)+'</div><div class="hmeta">'+esc(x.meta)+'</div></div>'; }); $('historyList').innerHTML=h; }
  function loadHistory(i){ var x=HISTORY[i]; $('historyPanel').hidden=true;
    // demo: reload the sample edits; a real panel would restore that file's captions
    caps=seed(); selId=null; undoStack.length=0; redoStack.length=0; clearFind(); render();
    toast("Reopened "+x.name,'ok'); }

  /* ---------- settings: theme / accent / UI size ---------- */
  function setTheme(mode){ if(mode==='dark')root.removeAttribute('data-theme'); else root.setAttribute('data-theme',mode);
    seg('segTheme',mode); }
  function hexToRgb(h){ h=h.replace('#',''); if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function setAccent(hex){ if(!/^#?[0-9a-fA-F]{6}$/.test(hex.replace('#','')))return; if(hex[0]!=='#')hex='#'+hex;
    var rgb=hexToRgb(hex); var hi=rgb.map(function(v){return Math.round(v*0.85);});
    root.style.setProperty('--accent',hex);
    root.style.setProperty('--accent-hi','rgb('+hi.join(',')+')');
    root.style.setProperty('--accent-dim','rgba('+rgb.join(',')+',0.14)');
    root.style.setProperty('--accent-sel','rgba('+rgb.join(',')+',0.30)');
    root.style.setProperty('--match-bg','rgba('+rgb.join(',')+',0.32)');
    $('accentHex').value=hex.toUpperCase(); $('accentColor').value=hex;
    $('accentSwatch').style.background=hex; }
  function setUiSize(v){ $('panel').style.zoom=(v/100); $('uiSizeVal').textContent=v+'%'; $('uiSize').value=v; }
  function seg(groupId,val){ Array.prototype.forEach.call($(groupId).querySelectorAll('.seg'),function(b){ b.classList.toggle('on',b.getAttribute('data-v')===val); }); }

  function openModal(id){ closeAll(null); $(id).hidden=false; }
  function closeModal(id){ $(id).hidden=true; }

  /* =========================================================================
     EVENTS
  ==========================================================================*/
  // list interactions
  listEl.addEventListener('click', function(e){
    var b=e.target.closest('.mini');
    if(b){ e.preventDefault(); var id=b.getAttribute('data-id'), act=b.getAttribute('data-act'); if(act==='flag')flagCap(id); else delCap(id); return; }
    var div=e.target.closest('.word-divider');
    if(div){ var did=div.getAttribute('data-id'); if(div.getAttribute('data-trailing')==='1'){ mergeNext(did); } else { var af=Number(div.getAttribute('data-after')); if(e.altKey)mergeWords(did,af); else splitAfter(did,af); } return; }
    var cap=e.target.closest('.cap');
    if(cap && !e.target.classList.contains('word') && !e.target.classList.contains('note')){
      selId=cap.getAttribute('data-id');
      Array.prototype.forEach.call(listEl.querySelectorAll('.cap'),function(el){ el.classList.toggle('sel',el.getAttribute('data-id')===selId); });
    }
  });
  listEl.addEventListener('dblclick', function(e){ var w=e.target.closest('.word'); if(w){ e.preventDefault(); startEdit(w); } });
  listEl.addEventListener('keydown', function(e){
    if(editing && e.target.classList.contains('word')){ if(e.key==='Enter'){e.preventDefault();e.target.blur();} else if(e.key==='Escape'){e.preventDefault();editing=null;render();} }
  });
  listEl.addEventListener('focusout', function(e){
    if(editing && e.target.classList && e.target.classList.contains('word')){ var ed=editing; editing=null; hintEl.textContent="Hover a line, click a / to split · double-click a word to edit"; commitWord(ed.capId,ed.wIndex,e.target.textContent); }
    else if(e.target.classList && e.target.classList.contains('note')){ commitNote(e.target.getAttribute('data-id'), e.target.textContent); }
  });

  // toolbar
  $('btnImport').addEventListener('click', doImport);
  $('btnExport').addEventListener('click', doExport);
  $('btnPush').addEventListener('click', doPush);
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnSync').addEventListener('click', toggleSync);
  $('btnFind').addEventListener('click', openFind);
  $('btnMenu').addEventListener('click', function(e){ e.stopPropagation(); toggle('appMenu'); });
  $('btnHistory').addEventListener('click', function(e){ e.stopPropagation(); if(toggle('historyPanel'))buildHistory(); });

  // app menu
  $('appMenu').addEventListener('click', function(e){ var it=e.target.closest('.menu-item'); if(!it)return; $('appMenu').hidden=true;
    if(it.getAttribute('data-menu')==='settings')openModal('settingsModal'); else openModal('aboutModal'); });
  // history
  $('historyList').addEventListener('click', function(e){ var it=e.target.closest('.hitem'); if(it)loadHistory(Number(it.getAttribute('data-h'))); });

  // cleanup
  $('cleanup').addEventListener('click', function(e){ var b=e.target.closest('.cleanup-btn'); if(b)cleanup(b.getAttribute('data-clean')); });

  // find bar
  $('findInput').addEventListener('input', function(){ findQuery=this.value; curMatch=0; runFind(); });
  $('findInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); e.shiftKey?stepMatch(-1):stepMatch(1); } else if(e.key==='Escape'){ clearFind(); } });
  $('findPrev').addEventListener('click', function(){ stepMatch(-1); });
  $('findNext').addEventListener('click', function(){ stepMatch(1); });
  $('findClose').addEventListener('click', clearFind);
  $('findCase').addEventListener('click', function(){ findCase=!findCase; this.classList.toggle('on',findCase); runFind(); });
  $('findWord').addEventListener('click', function(){ findWord=!findWord; this.classList.toggle('on',findWord); runFind(); });
  $('replaceAll').addEventListener('click', replaceAll);

  // settings nav
  Array.prototype.forEach.call(document.querySelectorAll('.snav'),function(n){ n.addEventListener('click',function(){
    var p=this.getAttribute('data-pane');
    Array.prototype.forEach.call(document.querySelectorAll('.snav'),function(x){x.classList.toggle('on',x===n);});
    Array.prototype.forEach.call(document.querySelectorAll('.spane'),function(x){x.classList.toggle('on',x.getAttribute('data-pane')===p);});
  }); });
  // theme
  $('segTheme').addEventListener('click', function(e){ var b=e.target.closest('.seg'); if(b)setTheme(b.getAttribute('data-v')); });
  // cleanup show/hide
  $('segCleanup').addEventListener('click', function(e){ var b=e.target.closest('.seg'); if(!b)return; seg('segCleanup',b.getAttribute('data-v')); $('cleanup').style.display=b.getAttribute('data-v')==='on'?'':'none'; });
  // accent
  $('accentColor').addEventListener('input', function(){ setAccent(this.value); });
  $('accentHex').addEventListener('change', function(){ setAccent(this.value.trim()); });
  $('accentReset').addEventListener('click', function(){ setAccent('#f03d13'); });
  // ui size
  $('uiSize').addEventListener('input', function(){ setUiSize(Number(this.value)); });
  $('uiSizeReset').addEventListener('click', function(){ setUiSize(100); });
  // presets
  (function(){ var h=''; PRESETS.forEach(function(c){ h+='<button class="sw" data-c="'+c+'" style="background:'+c+'" title="'+c+'"></button>'; }); $('accentPresets').innerHTML=h;
    $('accentPresets').addEventListener('click', function(e){ var b=e.target.closest('.sw'); if(b)setAccent(b.getAttribute('data-c')); }); })();

  // modal close (button + backdrop)
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'),function(b){ b.addEventListener('click',function(){ closeModal(this.getAttribute('data-close')==='settings'?'settingsModal':'aboutModal'); }); });
  ['settingsModal','aboutModal'].forEach(function(id){ $(id).addEventListener('click',function(e){ if(e.target===this)closeModal(id); }); });

  // global keys + outside-click
  document.addEventListener('keydown', function(e){
    if(!$('settingsModal').hidden||!$('aboutModal').hidden){ if(e.key==='Escape'){closeModal('settingsModal');closeModal('aboutModal');} return; }
    if(editing)return;
    if(e.key==='Escape'){ closeAll(null); if(findQuery)clearFind(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){ e.preventDefault(); openFind(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); }
  });
  document.addEventListener('click', function(e){ // outside click closes menu/history
    if(!e.target.closest('#appMenu')&&!e.target.closest('#btnMenu')) $('appMenu').hidden=true;
    if(!e.target.closest('#historyPanel')&&!e.target.closest('#btnHistory')) $('historyPanel').hidden=true;
  });

  setAccent('#f03d13');
  render();
})();
