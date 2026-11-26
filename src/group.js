// Gruppenfahrt ohne Konto: jeder gibt denselben Gruppencode ein, die Browser verbinden sich direkt (WebRTC).
// Die Vermittlung (nur das Finden der anderen) laeuft ueber den kostenlosen PeerJS-Dienst, Positionen gehen direkt von Browser zu Browser.
// Peer-Kennung = wab-<code>-<strecke>-<platz 0..7>: wer zuerst kommt, belegt Platz 0 usw. Gesendet wird die Streckenposition (s, Seitenversatz x, Tempo v).
export const GROUP_COLORS=['#ff4d4d','#3fa9ff','#ffd23f','#44e08a','#ff8c1a','#c77dff','#25e6e6','#ff6fb5'];
const SLOTS=8,STALE=15000,DEAD=4000;   // STALE: so lange bleibt ein stiller Mitfahrer sichtbar (iPad im Hintergrund/Ruhezustand drosselt); DEAD: Verbindung ohne Daten gilt als tot
const clean=t=>String(t).toLowerCase().replace(/[^a-z0-9äöüß]+/g,'').slice(0,24);
export function makeGroup(){
  const G={code:'',route:'',slot:-1,status:'aus',riders:new Map(),peer:null,conns:new Map(),sendT:0,retryT:0,gen:0};
  const pid=j=>'wab-'+G.code+'-'+G.route+'-'+j;
  function attach(c){
    const k=c.peer;
    const old=G.conns.get(k);
    if(old&&old!==c&&old.open&&performance.now()-(old._t||0)<DEAD){try{c.close();}catch(_){}return;}   // lebende Verbindung bleibt; tote (z.B. nach iPad-Neustart derselben Kennung) wird ersetzt
    if(old&&old!==c){try{old.close();}catch(_){}}
    c._t=performance.now();G.conns.set(k,c);
    c.on('data',d=>{c._t=performance.now();if(!d||typeof d.s!=='number'||typeof d.k!=='number')return;const r=G.riders.get(d.k)||{k:d.k,d:d.s};if(typeof d.n==='string')r.n=d.n.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,16);r.s=d.s;r.x=+d.x||0;r.v=+d.v||0;r.t=performance.now();G.riders.set(d.k,r);});
    const gone=()=>{if(G.conns.get(k)===c)G.conns.delete(k);};
    c.on('close',gone);c.on('error',gone);
  }
  function reach(){   // fehlende Plaetze anwaehlen (Nicht-Vorhandene schlagen still fehl)
    if(!G.peer||G.slot<0)return;
    for(let j=0;j<G.slot;j++){const id=pid(j);   // nur zu niedrigeren Plaetzen verbinden: eine Seite waehlt an, die andere nimmt an (vermeidet gegenseitiges Anwaehlen und Handshake-Kollisionen)
      {const o=G.conns.get(id);if(o&&o.open&&performance.now()-(o._t||0)<DEAD*2)continue;}
      try{attach(G.peer.connect(id,{reliable:false}));}catch(_){}}
  }
  function rejoin(gen,ms){const c=G.code,r=G.route;setTimeout(()=>{if(gen===G.gen&&c)G.join(c,r);},ms);}   // Verbindung neu aufbauen statt dauerhaft 'wartet'
  async function open(slot,gen){
    if(gen!==G.gen)return;
    if(slot>=SLOTS){G.status='Gruppe voll';return;}
    let Peer,p;try{Peer=(await import('peerjs')).default;if(gen!==G.gen)return;p=new Peer(pid(slot));}catch(e){if(gen===G.gen){G.status='offline (Start)';rejoin(gen,3000);}return;}
    p.on('open',()=>{if(gen!==G.gen){p.destroy();return;}G.peer=p;G.slot=slot;G.status='verbunden';reach();});
    p.on('connection',c=>{c.on('open',()=>attach(c));});
    p.on('error',e=>{
      if(gen!==G.gen)return;
      if(e&&e.type==='unavailable-id'){try{p.destroy();}catch(_){}open(slot+1,gen);}
      else if(e&&e.type!=='peer-unavailable'){G.status='offline ('+(e.type||'Fehler')+')';rejoin(gen,3000);}
    });
    p.on('disconnected',()=>{if(gen===G.gen){G.status='getrennt';try{p.reconnect();}catch(_){}setTimeout(()=>{if(gen===G.gen&&p.disconnected&&!p.destroyed){try{p.reconnect();}catch(_){}}},2500);}});
    p.on('close',()=>{if(gen===G.gen)rejoin(gen,2000);});
  }
  G.join=(code,route)=>{G.leave();G.code=clean(code);G.route=String(route).replace(/[^a-z0-9_]/gi,'');if(!G.code)return;G.status='verbinde …';G.gen++;open(0,G.gen);};
  G.leave=()=>{G.gen++;try{G.peer&&G.peer.destroy();}catch(_){}G.peer=null;G.slot=-1;G.conns.clear();G.riders.clear();G.status='aus';G.code='';};
  function beat(){const L=G.last;if(!G.peer||G.slot<0)return;const m=L?{k:G.slot,s:L.pos,x:L.x,v:L.running?L.v:0,n:G.name||''}:{k:G.slot,h:1};G.conns.forEach(c=>{if(c.open)try{c.send(m);}catch(_){}});}   // Lebenszeichen auch in Pause/Menue und bei verstecktem Tab
  let _r=0;setInterval(()=>{if(!G.peer||G.slot<0)return;beat();if(++_r%3===0)reach();},1000);   // Takt unabhaengig von der Bildrate (iPad ruckelt, Menue, Pause, Tab im Hintergrund)
  document.addEventListener('visibilitychange',()=>{if(document.hidden||!G.code)return;const p=G.peer;if(!p||p.destroyed)rejoin(G.gen,200);else{if(p.disconnected){try{p.reconnect();}catch(_){}}G.retryT=0;}});
  G.update=(dt,pos,x,v,running)=>{   // aufrufen pro Bild
    G.last={pos,x,v,running};
    if(!G.peer||G.slot<0)return;
    G.sendT-=dt;G.retryT-=dt;
    if(G.retryT<=0){G.retryT=3;reach();}
    if(G.sendT<=0){G.sendT=0.25;beat();}
    const now=performance.now();
    G.riders.forEach((r,k)=>{if(now-r.t>STALE){G.riders.delete(k);return;}
      const tg=r.s+r.v*Math.min(0.8,(now-r.t)/1000);r.d+=(tg-r.d)*Math.min(1,dt*8);});
  };
  G.live=()=>{const a=[];G.riders.forEach(r=>a.push(r));return a;};
  return G;
}
