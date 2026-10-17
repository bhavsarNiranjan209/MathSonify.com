import { writeFileSync } from 'node:fs';
const CDP='http://localhost:9222';
const res=await fetch(`${CDP}/json/new?http://localhost:4321/studio`,{method:'PUT'});
const t=await res.json();
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((ok)=>ws.addEventListener('open',ok,{once:true}));
let id=0;const p=new Map();
ws.addEventListener('message',(ev)=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}});
const send=(m,params={})=>new Promise((ok)=>{const i=++id;p.set(i,ok);ws.send(JSON.stringify({id:i,method:m,params}));});
await send('Page.enable');await send('Runtime.enable');
await send('Page.navigate',{url:'http://localhost:4321/studio'});
await new Promise((r)=>setTimeout(r,9000));
const r=await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const groups=[...document.querySelectorAll('[role="group"]')].map((g)=>({label:g.getAttribute('aria-label'),btns:[...g.querySelectorAll('button')].map((b)=>JSON.stringify(b.textContent))}));
  const btns3d=[...document.querySelectorAll('button')].filter((b)=>/3D/i.test(b.textContent||'')).map((b)=>({text:b.textContent.trim().slice(0,30),disabled:b.disabled,visible:b.offsetParent!==null}));
  return {groups,btns3d};
})()`});
console.log(JSON.stringify(r.result.value,null,1));
ws.close();process.exit(0);
