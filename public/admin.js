const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let D={settings:{},categories:[],products:[]},tab='p',edit=null,tT;
const catName=id=>(D.categories.find(c=>c.id===id)||{}).name||'Uncategorized';
function toast(m){clearTimeout(tT);let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=m;tT=setTimeout(()=>t.remove(),3000)}
async function api(url,method='GET',body){
  const o={method,headers:{}};
  if(body instanceof FormData)o.body=body;else if(body){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body)}
  const r=await fetch(url,o);const j=await r.json().catch(()=>({}));
  if(r.status===401&&url!=='/api/login'){loginView();throw new Error('Session expired')}
  if(!r.ok)throw new Error(j.error||'Request failed');return j}
async function load(){D=await (await fetch('/api/public',{cache:'no-store'})).json()}
function loginView(msg=''){$('#root').innerHTML=`<div class="md login"><div class="logo" style="margin-bottom:14px"><img class="lg" src="/logo.png" alt="">Admin sign in</div><div class="fl"><label>Username<input id="u" autocomplete="username"></label><label>Password<input id="pw" type="password" autocomplete="current-password"></label><div class="err" id="er">${esc(msg)}</div><button class="btn" id="go">Sign in</button><a class="note" href="/">← Back to website</a></div></div>`}
async function dash(){await load();
  let b='';
  if(tab==='p'){
    if(edit){const p=edit==='new'?{id:'',name:'',category_id:D.categories[0]?.id,description:'',specs:'',has_image:false}:D.products.find(x=>x.id===edit);
      b=`<div class="fl"><label>Name<input id="f-n" value="${esc(p.name)}"></label><label>Category<select id="f-c">${D.categories.map(c=>`<option value="${c.id}" ${c.id===p.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Description<textarea id="f-d" rows="3">${esc(p.description)}</textarea></label><label>Specifications (one “Label: value” per line)<textarea id="f-s" rows="5">${esc(p.specs)}</textarea></label><label>Image (JPG, PNG or WebP, max 3 MB)<input id="f-i" type="file" accept="image/*"></label>${p.has_image?'<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="f-r" style="width:auto"> Remove current image</label>':''}<div class="row" style="border:0"><button class="btn" id="ps" data-id="${p.id}">Save product</button><button class="btn g" id="pc">Cancel</button></div></div>`}
    else b=`<button class="btn" id="pn">+ Add product</button>${D.products.map(p=>`<div class="row"><span style="display:flex;gap:10px;align-items:center">${p.has_image?`<img class="thumb" src="/img/${p.id}?v=${p.v}" alt="">`:'<span class="thumb"></span>'}<span><b>${esc(p.name)}</b><br><span class="note">${esc(catName(p.category_id))}</span></span></span><span><button class="btn g s" data-pe="${p.id}">Edit</button> <button class="btn d s" data-pd="${p.id}">Delete</button></span></div>`).join('')||'<p class="note">No products yet.</p>'}`}
  if(tab==='c')b=`<div class="row" style="border:0"><input id="nc" placeholder="New category name" style="flex:1"><button class="btn" id="ca">Add</button></div>${D.categories.map(c=>`<div class="row"><input data-cr="${c.id}" value="${esc(c.name)}" style="flex:1"><span><button class="btn g s" data-cs="${c.id}">Rename</button> <button class="btn d s" data-cd="${c.id}">Delete</button></span></div>`).join('')}<p class="note">Deleting a category keeps its products; they show as “Uncategorized”.</p>`;
  if(tab==='s')b=`<div class="fl"><label>Business name<input id="s-n" value="${esc(D.settings.name)}"></label><label>Tagline<input id="s-t" value="${esc(D.settings.tagline)}"></label><label>WhatsApp number (country code, digits only, e.g. 923707652218)<input id="s-p" inputmode="numeric" value="${esc(D.settings.phone)}"></label><button class="btn" id="ss">Save settings</button></div>`;
  $('#root').innerHTML=`<div class="w" style="padding-top:18px;padding-bottom:30px"><div class="md" style="max-width:860px"><div class="top"><h2>Admin dashboard</h2><span><a class="btn g s" href="/" target="_blank">View site</a> <button class="btn d s" id="lo">Sign out</button></span></div><div class="tabs">${[['p','Products'],['c','Categories'],['s','Settings']].map(([k,n])=>`<button class="chip ${tab===k?'on':''}" data-t="${k}">${n}</button>`).join('')}</div>${b}</div></div>`}
async function run(fn){try{await fn()}catch(e){toast(e.message)}}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pw')$('#go').click()});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset,g=i=>$(i);
  run(async()=>{
  if(b.id==='go'){try{await api('/api/login','POST',{username:g('#u').value,password:g('#pw').value});tab='p';edit=null;await dash()}catch(er){g('#er').textContent=er.message}return}
  if(b.id==='lo'){await api('/api/logout','POST');loginView();return}
  if(d.t){tab=d.t;edit=null;await dash();return}
  if(b.id==='pn'){edit='new';await dash();return}
  if(b.id==='pc'){edit=null;await dash();return}
  if(d.pe){edit=+d.pe;await dash();return}
  if(d.pd){if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm?';return}await api('/api/products/'+d.pd,'DELETE');toast('Deleted');await dash();return}
  if(b.id==='ps'){const n=g('#f-n').value.trim();if(!n){toast('Name is required');return}
    const fd=new FormData();fd.append('name',n);fd.append('category_id',g('#f-c').value);fd.append('description',g('#f-d').value);fd.append('specs',g('#f-s').value);
    const f=g('#f-i').files[0];if(f)fd.append('image',f);if(g('#f-r')?.checked)fd.append('remove_image','1');
    await api(d.id?'/api/products/'+d.id:'/api/products',d.id?'PUT':'POST',fd);toast('Saved');edit=null;await dash();return}
  if(b.id==='ca'){await api('/api/categories','POST',{name:g('#nc').value});toast('Added');await dash();return}
  if(d.cs){await api('/api/categories/'+d.cs,'PUT',{name:g(`[data-cr="${d.cs}"]`).value});toast('Renamed');await dash();return}
  if(d.cd){if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm?';return}await api('/api/categories/'+d.cd,'DELETE');await dash();return}
  if(b.id==='ss'){await api('/api/settings','PUT',{name:g('#s-n').value,tagline:g('#s-t').value,phone:g('#s-p').value});toast('Settings saved');await dash();return}
  })});
api('/api/me').then(dash).catch(()=>loginView());
