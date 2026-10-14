/* ObraFácil Orçamentos — MVP PWA, 100% local (localStorage, perfis por usuário) */
let KEY='obrafacil_v1'; // base; vira obrafacil_v1_<perfil> ao entrar
const UNIDADES=['m²','m³','m linear','un','diária','hora','fechado'];
const CATS={mao_obra:'Mão de obra',material:'Material',outros:'Outros custos'};
const STATUS={rascunho:'Rascunho',enviado:'Enviado',aprovado:'Aprovado',recusado:'Recusado',concluido:'Concluído'};
const BRL=v=> (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const uid=()=> 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=> new Date().toLocaleDateString('pt-BR');
const _qs=s=>{try{return document.querySelector(s);}catch(e){return null;};};
const $$=s=>{try{return [...document.querySelectorAll(s)];}catch(e){return[];};};
// Blindagem: se o HTML em cache estiver defasado e um id não existir,
// absorve em vez de matar o script inteiro (modo degradado, app continua vivo).
// O aviso no console deixa o defeito visível para quem depura, sem travar o usuário.
const _missing=new Set();
function $(s){const el=_qs(s);if(el)return el;if(!_missing.has(s)){_missing.add(s);console.warn('[ObraFácil] elemento não encontrado:',s,'— HTML em cache defasado ou id errado');}return new Proxy(function(){},{get:(t,p)=>{if(p===Symbol.toPrimitive)return()=>' ';return()=>{};},set:()=>true,apply:()=>{}});}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function seed(){return {pro:{nome:'',fone:'',email:'',cidade:'',doc:'',logo:''},seq:122,
clients:[
 {id:'c1',ex:true,nome:'João Silva (exemplo)',fone:'(11) 98765-4321',email:'joao@email.com',endereco:'Rua das Flores, 123 - Jardim das Acácias',obs:'Prefere obra aos sábados.'},
 {id:'c2',ex:true,nome:'Maria Souza (exemplo)',fone:'(11) 91234-5678',email:'',endereco:'',obs:''},
 {id:'c3',ex:true,nome:'Ricardo Lima (exemplo)',fone:'(11) 99876-5432',email:'',endereco:'',obs:''},
 {id:'c4',ex:true,nome:'Ana Pereira (exemplo)',fone:'(11) 97654-3210',email:'',endereco:'',obs:''}],
services:[
 {id:'s1',nome:'Assentamento de piso',un:'m²',preco:35,cat:'mao_obra'},
 {id:'s2',nome:'Reboco',un:'m²',preco:28,cat:'mao_obra'},
 {id:'s3',nome:'Pintura',un:'m²',preco:22,cat:'mao_obra'},
 {id:'s4',nome:'Instalação elétrica',un:'un',preco:180,cat:'mao_obra'},
 {id:'s5',nome:'Construção de muro',un:'m²',preco:90,cat:'mao_obra'},
 {id:'s6',nome:'Tinta acrílica',un:'un',preco:120,cat:'material'}],
budgets:[
 {id:'b1',ex:true,number:'000121',clientId:'c1',obra:'Reforma do banheiro (exemplo)',endereco:'Rua das Flores, 123',items:[
   {id:'i1',nome:'Assentamento de piso',un:'m²',qtd:30,unit:35,cat:'mao_obra'},
   {id:'i2',nome:'Reboco',un:'m²',qtd:20,unit:28,cat:'mao_obra'},
   {id:'i3',nome:'Mão de obra complementar',un:'diária',qtd:2,unit:180,cat:'mao_obra'}],
  desconto:0,prazo:'15 dias',validade:30,pag:'50% entrada + 50% na entrega',obs:'',status:'aprovado',createdAt:Date.now()-86400000*5,updatedAt:Date.now()-86400000*5},
 {id:'b2',ex:true,number:'000122',clientId:'',obra:'Construção de muro (exemplo)',endereco:'',items:[{id:'i9',nome:'Construção de muro',un:'m²',qtd:40,unit:90,cat:'mao_obra'}],desconto:0,prazo:'20 dias',validade:15,pag:'A combinar',obs:'',status:'enviado',createdAt:Date.now()-86400000*2,updatedAt:Date.now()-86400000*2}
]};}
let DB=null;
// save() = alteração do usuário: carimba a hora e agenda envio para a nuvem.
// saveLocal() = só grava no aparelho (migrações/carga), sem parecer "mais novo" que a nuvem.
function saveLocal(){if(!DB)return;try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){toast('Armazenamento cheio — remova o logo ou faça backup');}}
function save(){if(!DB)return;DB.updatedAt=Date.now();saveLocal();queueSync();}

// AUTH (PRD Login) — backend Supabase. Sem sessão válida, sem acesso.
let authUser=null; // {id,email}
let supa=null;
function authConfigured(){return !!(window.OBRAFACIL_AUTH&&window.OBRAFACIL_AUTH.url&&window.OBRAFACIL_AUTH.anonKey)&&!!window.supabase;}
function initAuth(){if(!authConfigured())return false;try{supa=window.supabase.createClient(window.OBRAFACIL_AUTH.url,window.OBRAFACIL_AUTH.anonKey);return true;}catch{return false;}}
// Métricas de login (PRD §10) — contadores locais deste aparelho
const AKEY='obrafacil_auth_metrics';
function aMetrics(){try{const m=JSON.parse(localStorage.getItem(AKEY));if(m&&typeof m==='object')return Object.assign({attempts:0,ok:0,fail:0,rec:0,times:[]},m);}catch{}return{attempts:0,ok:0,fail:0,rec:0,times:[]};}
function aSave(m){try{localStorage.setItem(AKEY,JSON.stringify(m));}catch{}}
let _freshSeed=false; // aparelho sem dados deste usuário: começou só com os exemplos
function initDB(){
 _freshSeed=!localStorage.getItem(KEY);
 try{DB=JSON.parse(localStorage.getItem(KEY))||seed();}catch{DB=seed();}
 if(!DB.seq)DB.seq=123;
 if(!DB.pro)DB.pro={nome:'',fone:'',email:'',cidade:'',doc:'',logo:''};
 if(!('logo' in DB.pro))DB.pro.logo='';
 (DB.budgets||[]).forEach(b=>{if(!b.clientName){const c=(DB.clients||[]).find(x=>x.id===b.clientId);b.clientName=c?c.nome:'Cliente avulso';}});
 // Migração: marca exemplos antigos (antes da flag ex) pelos ids/números do seed
 ['b1','b2'].forEach(id=>{const b=(DB.budgets||[]).find(x=>x.id===id);if(b)b.ex=true;});
 ['c1','c2','c3','c4'].forEach(id=>{const c=(DB.clients||[]).find(x=>x.id===id);if(c){c.ex=true;if(!/exemplo/i.test(c.nome))c.nome+=' (exemplo)';}});
 (DB.budgets||[]).forEach(b=>{if(b.ex&&b.obra&&!/exemplo/i.test(b.obra))b.obra+=' (exemplo)';});
 normalizeDB();
 saveLocal();
}

// MÉTRICAS DO PILOTO (§11) — 100% locais, sem rede (padrões em normalizeDB, por perfil)
let _wzStart=0;
function mSave(){save();}

let route='home', editingId=null, draft={clientId:'',obra:'',endereco:'',items:[],desconto:0,prazo:'',validade:30,pag:'',obs:'',status:'rascunho'};
let budgetFilter='todos';

function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,2200);}
function calc(items,desc){const sub=items.reduce((a,i)=>a+(+i.qtd||0)*(+i.unit||0),0);const d=Math.min(+desc||0,sub);return{sub,total:sub-d,d};}
function totalsByCat(items){const r={mao_obra:0,material:0,outros:0};items.forEach(i=>{r[i.cat||'outros']+=(+i.qtd||0)*(+i.unit||0);});return r;}
function clientName(b){const c=DB.clients.find(x=>x.id===b.clientId);return c?c.nome:(b.clientName||'Cliente avulso');}
function clientObj(b){return DB.clients.find(x=>x.id===b.clientId)||null;}
function nextNumber(){DB.seq+=1;save();return String(DB.seq).padStart(6,'0');}

// NAV
const TITLES={home:'ObraFácil',budgets:'Meus Orçamentos',clients:'Meus Clientes',services:'Meus Serviços',pro:'Meus Dados',wizard:'Novo Orçamento',detail:'Orçamento',share:'Compartilhar Orçamento',login:'Entrar',recovery:'Recuperar senha'};
function go(r){if(!authUser&&r!=='login'&&r!=='recovery')r='login'; // áreas protegidas (RN)
 route=r;$$('.view').forEach(v=>v.hidden=true);$('#view-'+r).hidden=false; $$('#tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.go===r));
 const inLogin=r==='login';$('#topbar').style.display=inLogin?'none':'';$('#tabbar').style.display=inLogin?'none':'';document.body.style.paddingBottom=inLogin?'24px':'';
 $('#topbar-title').textContent=r==='wizard'&&editingId?'Editar Orçamento':(TITLES[r]||'ObraFácil');
 $('#btn-back').hidden=(r==='home');
 if(r==='home')renderHome(); if(r==='budgets')renderBudgets(); if(r==='clients')renderClients(); if(r==='services')renderServices(); if(r==='pro')renderPro(); if(r==='wizard')renderWizard(); if(r==='login')renderLoginStatic(); if(r==='recovery'){/* estado definido pelo fluxo */}
 window.scrollTo(0,0);}
// Novo orçamento via botões data-go sempre começa do zero. Edição e "orçamento de cliente" usam go('wizard') direto e preservam o draft.
// Sair do orçamento em andamento pede confirmação (toque acidental não perde o que foi digitado)
function leaveWizardOk(){return route!=='wizard'||!draft.items.length||confirm('Sair sem salvar este orçamento? O que foi digitado será perdido.');}
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(!b)return;if(b.dataset.go!=='wizard'&&!leaveWizardOk())return;if(b.dataset.go==='wizard'){startWizard();}go(b.dataset.go);});
$('#btn-back').onclick=()=>{if(leaveWizardOk())go('home');}; $('#btn-pro').onclick=()=>{if(leaveWizardOk())go('pro');};

// HOME
function renderHome(){$('#greet-name').textContent='Olá'+(DB.pro.nome?', '+DB.pro.nome.split(' ')[0]:'')+'!';
 const ab=DB.budgets.filter(b=>['rascunho'].includes(b.status)).length;
 const en=DB.budgets.filter(b=>b.status==='enviado').length;
 const ap=DB.budgets.filter(b=>b.status==='aprovado'||b.status==='concluido');
 $('#r-aberto').textContent=ab; $('#r-enviados').textContent=en; $('#r-aprovados').textContent=ap.length;
 $('#r-valor').textContent=BRL(ap.reduce((a,b)=>a+calc(b.items,b.desconto).total,0));
 // Onboarding (primeira configuração)
 const steps=[{ok:!!DB.pro.nome,label:'Cadastrar meus dados',go:'pro'},{ok:DB.services.length>0,label:'Ter ao menos 1 serviço no catálogo',go:'services'},{ok:DB.clients.length>0,label:'Ter ao menos 1 cliente',go:'clients'},{ok:DB.budgets.length>0,label:'Criar o primeiro orçamento',go:'wizard'}];
 const missing=steps.filter(s=>!s.ok);
 $('#onboard-card').hidden=missing.length===0;
 $('#onboard-list').innerHTML=steps.map(s=>`<div class="row"><span class="${s.ok?'tick':'todo'}">${s.ok?'✓':'○'}</span><span class="grow">${esc(s.label)}</span>${s.ok?'':`<button class="btn small secondary" data-go="${s.go}">Fazer</button>`}</div>`).join('');
 renderInstallCard();}
$('#btn-backup-export').onclick=()=>{const blob=new Blob([JSON.stringify(DB)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='obrafacil-backup.json';a.click();toast('Backup baixado ✔');};
$('#btn-backup-import').onclick=()=>$('#file-import').click();
$('#file-import').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d||!Array.isArray(d.budgets)||!Array.isArray(d.clients))throw 0;DB=d;normalizeDB();save();renderHome();toast('Dados restaurados ✔');}catch{toast('Arquivo inválido');}};r.readAsText(f);e.target.value='';};

// BUDGETS
$('#filter-status').onclick=e=>{const b=e.target.closest('.chip');if(!b)return;budgetFilter=b.dataset.f;$$('#filter-status .chip').forEach(c=>c.classList.toggle('active',c===b));renderBudgets();};
$('#search-budgets').oninput=renderBudgets;
function daysLeft(b){return Math.ceil(((b.createdAt||Date.now())+(+b.validade||0)*86400000-Date.now())/86400000);}
function renderBudgets(){const q=($('#search-budgets').value||'').toLowerCase();
 // Aviso de dados de exemplo no primeiro uso
 const nEx=DB.budgets.filter(b=>b.ex).length+DB.clients.filter(c=>c.ex).length;
 $('#examples').innerHTML=nEx?`<div class="warn-card">Estes são <b>dados de exemplo</b> para conhecer o app. <button class="btn small secondary" id="btn-clear-ex">Apagar exemplos e começar do zero</button></div>`:'';
 const _cx=$('#btn-clear-ex');if(_cx)_cx.onclick=()=>{if(!confirm('Apagar orçamentos e clientes de exemplo? O catálogo de serviços será mantido.'))return;DB.budgets=DB.budgets.filter(b=>!b.ex);DB.clients=DB.clients.filter(c=>!c.ex);save();renderBudgets();renderHome();toast('Pronto para seus dados reais ✔');};
 // Lembretes de retorno: enviados vencendo em ≤7 dias ou já vencidos (sem virar agenda)
 const fups=DB.budgets.filter(b=>b.status==='enviado').map(b=>({b,d:daysLeft(b)})).filter(x=>x.d<=7).sort((a,b)=>a.d-b.d);
 $('#followups').innerHTML=fups.length?'<div class="warn-card"><b>Retomar contato</b> — orçamentos enviados perto de vencer ou vencidos:</div>'+fups.map(({b,d})=>{const{total}=calc(b.items,b.desconto);
  const quando=d<0?`venceu há ${-d}d`:d===0?'vence hoje':`vence em ${d}d`;
  return `<div class="b-item"><span><b class="t">#${b.number} — ${esc(b.obra||'Sem nome')}</b><br><small>${esc(clientName(b))} · ${quando} · ${BRL(total)}</small></span><span class="row"><button class="btn small whatsapp" data-fup="${b.id}">Cobrar</button></span></div>`;}).join(''):'';
 $$('#followups [data-fup]').forEach(x=>x.onclick=()=>{const b=DB.budgets.find(y=>y.id===x.dataset.fup);const{total}=calc(b.items,b.desconto);const c=clientObj(b);const txt=fillTpl(FOLLOW_MSG,b,total);const phone=(c&&c.fone||'').replace(/\D/g,'');window.open(`https://wa.me/${phone?'55'+phone.replace(/^55/,''):''}?text=${encodeURIComponent(txt)}`,'_blank');});
 const list=DB.budgets.filter(b=>{if(budgetFilter==='todos')return true;if(budgetFilter==='aprovado')return b.status==='aprovado'||b.status==='concluido';return b.status===budgetFilter;})
  .filter(b=>(clientName(b)+' '+(b.obra||'')+' '+b.number).toLowerCase().includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);
 $('#budget-list').innerHTML=list.length?list.map(b=>{const{total}=calc(b.items,b.desconto);
  return `<button class="b-item" data-open="${b.id}"><span><span class="badge ${b.status}">${STATUS[b.status]}</span><br><b class="t">${esc(b.obra||'Sem nome')} — ${esc(clientName(b))}</b><br><small>#${b.number} · ${new Date(b.updatedAt).toLocaleDateString('pt-BR')}</small></span><span class="v">${BRL(total)} ›</span></button>`;}).join(''):'<p class="hint">Nenhum orçamento. Toque em ＋ para criar.</p>';
 $$('#budget-list [data-open]').forEach(x=>x.onclick=()=>openDetail(x.dataset.open));}

// CLIENTS
$('#search-clients').oninput=renderClients;
function initials(n){return (n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
function color(n){let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 60% 70%)`;}
function renderClients(){const q=($('#search-clients').value||'').toLowerCase();
 const list=DB.clients.filter(c=>(c.nome+c.fone).toLowerCase().includes(q));
 $('#client-list').innerHTML=list.map(c=>`<div class="b-item"><span><span class="avatar" style="background:${color(c.nome)}">${esc(initials(c.nome||'?'))}</span><b>${esc(c.nome)}</b><br><small>${esc(c.fone||'')}</small></span><span class="row"><button class="btn small secondary" data-cEdit="${c.id}">Editar</button><button class="btn small secondary" data-cOrc="${c.id}">＋ Orçamento</button><button class="btn small danger" data-cDel="${c.id}">✕</button></span></div>`).join('')||'<p class="hint">Nenhum cliente.</p>';
 $$('#client-list [data-cEdit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openClientModal(b.dataset.cedit);});
 $$('#client-list [data-cOrc]').forEach(b=>b.onclick=()=>{startWizard();draft.clientId=b.dataset.corc;go('wizard');});
 $$('#client-list [data-cDel]').forEach(b=>b.onclick=e=>{e.stopPropagation();const c=DB.clients.find(x=>x.id===b.dataset.cdel);if(!confirm(`Excluir ${c.nome}? Orçamentos antigos mantêm o nome.`))return;DB.clients=DB.clients.filter(x=>x.id!==b.dataset.cdel);save();renderClients();toast('Cliente excluído');});}
$('#fab-client').onclick=()=>openClientModal();

// MODAL generic
let modalSave=null;
function openModal(title,html,onSave,saveLabel){$('#modal-title').textContent=title;$('#modal-body').innerHTML=html;$('#modal-save').textContent=saveLabel||'Salvar';$('#modal').hidden=false;modalSave=onSave;}
$('#modal-close').onclick=()=>$('#modal').hidden=true;
$('#modal-save').onclick=()=>{if(modalSave)modalSave();};
function field(id,label,val='',type='text',ph=''){return `<label>${label}<input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph||'')}"></label>`;}

function openClientModal(id,afterSave){const c=id?DB.clients.find(x=>x.id===id):{nome:'',fone:'',email:'',endereco:'',obs:''};
 openModal(id?'Editar cliente':'Novo cliente', field('m-nome','Nome do cliente *',c.nome)+' '+field('m-fone','Telefone / WhatsApp',c.fone||'','tel','(11) 98765-4321')+field('m-email','E-mail',c.email||'')+field('m-end','Endereço da obra',c.endereco||'')+`<label>Observações<textarea id="m-obs" rows="2">${esc(c.obs||'')}</textarea></label>`,()=>{
  const nome=$('#m-nome').value.trim();if(!nome){toast('Informe o nome do cliente');return;}
  const data={nome,fone:$('#m-fone').value.trim(),email:$('#m-email').value.trim(),endereco:$('#m-end').value.trim(),obs:$('#m-obs').value.trim()};
  let newId=id;
  if(id)Object.assign(c,data);else{newId=uid();DB.clients.push({id:newId,...data});}
  save();$('#modal').hidden=true;if(route==='clients')renderClients();toast('Cliente salvo ✔');if(afterSave)afterSave(newId);});}

// SERVICES
function renderServices(){$('#service-list').innerHTML=DB.services.map(s=>`<div class="b-item"><span><span class="m-ic green" style="width:38px;height:38px;display:inline-flex;vertical-align:middle;margin:0 6px 0 0"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M12 9L4 17l3 3 8-8"/></svg></span><b>${esc(s.nome)}</b><br><small>${CATS[s.cat]||''} · ${esc(s.un)} · ${BRL(s.preco)}</small></span><span class="row"><button class="btn small secondary" data-sEdit="${s.id}">Editar</button><button class="btn small danger" data-sDel="${s.id}">✕</button></span></div>`).join('')||'<p class="hint">Cadastre seus serviços.</p>';
 $$('#service-list [data-sEdit]').forEach(b=>b.onclick=()=>openServiceModal(b.dataset.sedit));
 $$('#service-list [data-sDel]').forEach(b=>b.onclick=()=>{if(!confirm('Excluir este serviço do catálogo? (orçamentos antigos não mudam)'))return;DB.services=DB.services.filter(x=>x.id!==b.dataset.sdel);save();renderServices();});}
$('#fab-service').onclick=()=>openServiceModal();
function openServiceModal(id){const s=id?DB.services.find(x=>x.id===id):{nome:'',un:'m²',preco:0,cat:'mao_obra'};
 openModal(id?'Editar serviço':'Novo serviço', field('m-nome','Nome *',s.nome)+`<label>Unidade<select id="m-un">${UNIDADES.map(u=>`<option ${u===s.un?'selected':''}>${u}</option>`).join('')}</select></label>`+field('m-preco','Preço sugerido (R$)',s.preco,'number')+`<label>Categoria<select id="m-cat">${Object.entries(CATS).map(([k,v])=>`<option value="${k}" ${k===s.cat?'selected':''}>${v}</option>`).join('')}</select></label>`,()=>{
  const nome=$('#m-nome').value.trim();if(!nome){toast('Dê um nome ao serviço');return;}
  const data={nome,un:$('#m-un').value,preco:+$('#m-preco').value||0,cat:$('#m-cat').value};
  if(id)Object.assign(s,data);else DB.services.push({id:uid(),...data});
  save();$('#modal').hidden=true;renderServices();toast('Serviço salvo ✔');});}

// PRO
function renderPro(){$('#pro-nome').value=DB.pro.nome||'';$('#pro-fone').value=DB.pro.fone||'';$('#pro-email').value=DB.pro.email||'';$('#pro-cidade').value=DB.pro.cidade||'';$('#pro-doc').value=DB.pro.doc||'';$('#set-msg').value=(DB.settings&&DB.settings.msg)||DEFAULT_MSG;
 $('#prof-name').textContent=authUser?authUser.email:'—';setSync(_syncState);
 const pv=$('#pro-logo-prev');if(DB.pro.logo){pv.src=DB.pro.logo;pv.style.display='block';$('#pro-logo-del').hidden=false;}else{pv.style.display='none';$('#pro-logo-del').hidden=true;}$('#pro-logo').value='';}
let _tmpLogo=null;
$('#pro-logo').onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>700*1024){toast('Logo muito grande (máx 700KB)');return;}const r=new FileReader();r.onload=()=>{_tmpLogo=r.result;const pv=$('#pro-logo-prev');pv.src=_tmpLogo;pv.style.display='block';$('#pro-logo-del').hidden=false;};r.readAsDataURL(f);};
$('#pro-logo-del').onclick=()=>{_tmpLogo='';DB.pro.logo='';save();renderPro();};
$('#btn-pro-save').onclick=()=>{const nome=$('#pro-nome').value.trim();if(!nome){toast('Informe seu nome profissional');return;}DB.pro={nome,fone:$('#pro-fone').value.trim(),email:$('#pro-email').value.trim(),cidade:$('#pro-cidade').value.trim(),doc:$('#pro-doc').value.trim(),logo:_tmpLogo!==null?_tmpLogo:(DB.pro.logo||'')};_tmpLogo=null;save();toast('Dados salvos ✔');go('home');};
$('#btn-msg-save').onclick=()=>{const t=$('#set-msg').value.trim();if(!t){toast('Mensagem vazia — use Restaurar padrão');return;}DB.settings.msg=t;save();toast('Mensagem salva ✔');};
$('#btn-msg-reset').onclick=()=>{DB.settings.msg=DEFAULT_MSG;save();$('#set-msg').value=DEFAULT_MSG;toast('Padrão restaurado');};
$('#btn-logout').onclick=()=>{if(confirm('Sair da sua conta neste celular?'))logout();};

// WIZARD
function startWizard(){editingId=null;draft={clientId:'',obra:'',endereco:'',items:[],desconto:0,prazo:'',validade:30,pag:'50% na entrada e 50% na conclusão',obs:'',status:'rascunho'};_wzStart=Date.now();DB.metrics.starts+=1;mSave();}
function renderWizard(){setStep(1);
 const sel=$('#wz-client');sel.innerHTML='<option value="">— Escolher / avulso —</option>'+DB.clients.map(c=>`<option value="${c.id}" ${c.id===draft.clientId?'selected':''}>${esc(c.nome)}</option>`).join('');
 $('#wz-obra').value=draft.obra||'';$('#wz-endereco').value=draft.endereco||'';
 $('#wz-desc').value=draft.desconto||0;$('#wz-prazo').value=draft.prazo||'';$('#wz-validade').value=draft.validade??30;$('#wz-pag').value=draft.pag||'';$('#wz-obs').value=draft.obs||'';$('#wz-status').value=draft.status||'rascunho';
 renderWzItems();}
function setStep(n){[1,2,3].forEach(i=>{$('#wz-'+i).hidden=i!==n;});$$('.steps li').forEach(li=>li.classList.toggle('active',+li.dataset.s===n));}
$$('.steps li').forEach(li=>li.onclick=()=>{const n=+li.dataset.s;if(n===2&&!$('#wz-client').value&&!$('#wz-obra').value.trim()){toast('Escolha o cliente ou dê um nome à obra');return;}if(n===3&&!draft.items.length){toast('Adicione ao menos 1 serviço');return;}if(n===3)renderReview();setStep(n);});
$('#wz-new-client').onclick=()=>openClientModal(null,newId=>{draft.clientId=newId;renderWizard();setStep(1);toast('Cliente vinculado ✔');});
$('#wz-client').onchange=e=>draft.clientId=e.target.value;
$('#wz-obra').oninput=e=>draft.obra=e.target.value; $('#wz-endereco').oninput=e=>draft.endereco=e.target.value;
$('#wz-to-2').onclick=()=>{if(!$('#wz-client').value && !$('#wz-obra').value.trim()){toast('Escolha o cliente ou dê um nome à obra');return;}draft.clientId=$('#wz-client').value;draft.obra=$('#wz-obra').value;draft.endereco=$('#wz-endereco').value;setStep(2);};
$('#wz-back-1').onclick=()=>setStep(1); $('#wz-back-2').onclick=()=>setStep(2); $('#wz-to-3').onclick=()=>{if(!draft.items.length){toast('Adicione ao menos 1 serviço');return;}renderReview();setStep(3);};

function renderWzItems(){
 $('#wz-catalog').innerHTML=!DB.services.length?'<small class="hint">Seu catálogo está vazio — use "＋ Item fora do catálogo" abaixo ou cadastre preços em Serviços.</small>':'<small>Toque para adicionar do catálogo:</small><div class="chips">'+DB.services.map(s=>`<button class="chip" data-cat="${s.id}"><span>＋ ${esc(s.nome)}</span><small>${BRL(s.preco)}/${esc(s.un)}</small></button>`).join('')+'</div>';
 $$('#wz-catalog [data-cat]').forEach(b=>b.onclick=()=>{const s=DB.services.find(x=>x.id===b.dataset.cat);draft.items.push({id:uid(),nome:s.nome,un:s.un,qtd:1,unit:s.preco,cat:s.cat});renderWzItems();focusLastItem();toast('Adicionado: '+s.nome);});
 // Cartão do item no celular: nome | qtd (−/+) + valor unit. | unidade + categoria | total do item + remover
 $('#wz-items').innerHTML=draft.items.map((it,idx)=>`<div class="item-card"><div class="item-head"><b>Item ${idx+1}</b><span class="cat">${CATS[it.cat]||''}</span></div>
  <input value="${esc(it.nome)}" data-k="nome" data-i="${idx}" placeholder="Nome do serviço/material" aria-label="Nome do item">
  <div class="item-grid">
   <label class="mini">Quantidade<div class="stepper"><button type="button" data-step="-1" data-i="${idx}" aria-label="Diminuir quantidade">−</button><input type="number" min="0" step="any" value="${it.qtd}" data-k="qtd" data-i="${idx}" inputmode="decimal" aria-label="Quantidade"><button type="button" data-step="1" data-i="${idx}" aria-label="Aumentar quantidade">+</button></div></label>
   <label class="mini">Valor unit. (R$)<input type="number" min="0" step="0.01" value="${it.unit}" data-k="unit" data-i="${idx}" inputmode="decimal" aria-label="Valor unitário"></label>
   <label class="mini">Unidade<select data-k="un" data-i="${idx}">${UNIDADES.map(u=>`<option ${u===it.un?'selected':''}>${u}</option>`).join('')}</select></label>
   <label class="mini">Categoria<select data-k="cat" data-i="${idx}">${Object.entries(CATS).map(([k,v])=>`<option value="${k}" ${k===it.cat?'selected':''}>${v}</option>`).join('')}</select></label>
  </div>
  <div class="item-foot"><span>Total do item <b class="line-total">${BRL((+it.qtd||0)*(+it.unit||0))}</b></span><button class="btn small danger" data-del="${idx}" aria-label="Remover item ${idx+1}">Remover</button></div></div>`).join('')||'<p class="hint">Nenhum item ainda. Toque num serviço do catálogo acima ou em ＋ Adicionar serviço.</p>';
 $$('#wz-items [data-k]').forEach(el=>el.oninput=()=>{const i=+el.dataset.i,k=el.dataset.k;draft.items[i][k]=k==='qtd'||k==='unit'?+el.value:el.value;updTotals(el.closest('.item-card'),i);if(k==='cat'){const c=el.closest('.item-card').querySelector('.cat');if(c)c.textContent=CATS[el.value]||'';}});
 $$('#wz-items [data-del]').forEach(b=>b.onclick=()=>{const i=+b.dataset.del;const nome=draft.items[i].nome||'item';draft.items.splice(i,1);renderWzItems();toast('Removido: '+nome);});
 $$('#wz-items [data-step]').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;const it=draft.items[i];it.qtd=Math.max(0,Math.round(((+it.qtd||0)+ +b.dataset.step)*100)/100);const card=b.closest('.item-card');card.querySelector('[data-k="qtd"]').value=it.qtd;updTotals(card,i);});
 showWzTotals();}
// Total aparece no quadro de totais e na barra fixa do rodapé da etapa 2
function showWzTotals(){const{sub,total}=calc(draft.items,draft.desconto);$('#wz-sub').textContent=BRL(sub);$('#wz-total').textContent=BRL(total);$('#wz-foot-total').textContent=BRL(total);}
function focusLastItem(){const cards=$$('#wz-items .item-card');const c=cards[cards.length-1];if(c){c.scrollIntoView({behavior:'smooth',block:'center'});c.classList.add('flash');setTimeout(()=>c.classList.remove('flash'),900);}}
function updTotals(card,i){const it=draft.items[i];if(card){const lt=card.querySelector('.line-total');if(lt)lt.textContent=BRL((+it.qtd||0)*(+it.unit||0));}showWzTotals();}
// Tocar num campo numérico seleciona o valor: digitar 30 sobre "1" vira 30, não 130
document.addEventListener('focusin',e=>{const t=e.target;if(t.matches&&t.matches('input[type=number]'))setTimeout(()=>{try{t.select();}catch(err){}},0);});
$('#wz-desc').oninput=e=>{draft.desconto=Math.max(0,+e.target.value||0);const{sub,total,d}=calc(draft.items,draft.desconto);if((+e.target.value||0)>sub){e.target.value=sub;draft.desconto=sub;}showWzTotals();};
$('#wz-add-item').onclick=()=>{draft.items.push({id:uid(),nome:'',un:'m²',qtd:1,unit:0,cat:'mao_obra'});renderWzItems();focusLastItem();const n=$$('#wz-items [data-k="nome"]');if(n.length)n[n.length-1].focus();};

function renderReview(){const{sub,total}=calc(draft.items,draft.desconto);const c=DB.clients.find(x=>x.id===draft.clientId);
 $('#wz-review').innerHTML=`<p><b>Cliente:</b> ${esc(c?c.nome:'Avulso')}<br><b>Obra:</b> ${esc(draft.obra||'—')}<br><b>Itens:</b> ${draft.items.length}</p>
 <table class="items"><tr><th>Serviço</th><th class="n">Qtd</th><th class="n">Total</th></tr>${draft.items.map(i=>`<tr><td>${esc(i.nome)}<br><small>${i.qtd} ${esc(i.un)} × ${BRL(i.unit)}</small></td><td class="n">${i.qtd}</td><td class="n">${BRL(i.qtd*i.unit)}</td></tr>`).join('')}</table>
 <p>Subtotal: ${BRL(sub)}<br>Desconto: ${BRL(draft.desconto)}<br><b>Total: ${BRL(total)}</b></p>`;}
['wz-prazo','wz-validade','wz-pag','wz-obs','wz-status'].forEach(id=>{$('#'+id).addEventListener('input',()=>{draft.prazo=$('#wz-prazo').value;draft.validade=+$('#wz-validade').value||0;draft.pag=$('#wz-pag').value;draft.obs=$('#wz-obs').value;draft.status=$('#wz-status').value;draft.desconto=+$('#wz-desc').value||0;});});
$('#wz-save').onclick=()=>{
 draft.prazo=$('#wz-prazo').value.trim();draft.validade=+$('#wz-validade').value||0;draft.pag=$('#wz-pag').value.trim();draft.obs=$('#wz-obs').value.trim();draft.status=$('#wz-status').value;draft.desconto=Math.max(0,+$('#wz-desc').value||0);
 if(!draft.items.length){toast('Adicione itens');return;}
 if(draft.items.some(i=>!i.nome.trim())){toast('Dê nome a todos os itens');return;}
 const cnow=DB.clients.find(x=>x.id===draft.clientId);
 const snapshot=cnow?{clientName:cnow.nome,clientFone:cnow.fone,clientEmail:cnow.email}:{clientName:'Cliente avulso',clientFone:'',clientEmail:''};
 if(editingId){const b=DB.budgets.find(x=>x.id===editingId);Object.assign(b,{clientId:draft.clientId,obra:draft.obra.trim(),endereco:draft.endereco.trim(),items:JSON.parse(JSON.stringify(draft.items)),desconto:draft.desconto,prazo:draft.prazo,validade:draft.validade,pag:draft.pag,obs:draft.obs,status:draft.status,updatedAt:Date.now(),...snapshot});}
 else{DB.budgets.push({id:uid(),number:nextNumber(),clientId:draft.clientId,obra:draft.obra.trim(),endereco:draft.endereco.trim(),items:JSON.parse(JSON.stringify(draft.items)),desconto:draft.desconto,prazo:draft.prazo,validade:draft.validade,pag:draft.pag,obs:draft.obs,status:draft.status,createdAt:Date.now(),updatedAt:Date.now(),...snapshot});editingId=DB.budgets[DB.budgets.length-1].id;}
 // Métrica piloto: tempo de criação (máx 30min p/ ignorar app esquecido aberto)
 if(_wzStart){const dur=Math.min(1800,Math.round((Date.now()-_wzStart)/1000));DB.metrics.finishes.push(dur);if(DB.metrics.finishes.length>100)DB.metrics.finishes.shift();_wzStart=0;}
 save();toast('Orçamento salvo ✔');openDetail(editingId);};
$('#wz-edit-toggle').onclick=()=>setStep(2);

// DETAIL + PDF
let currentId=null;
function getB(){return DB.budgets.find(x=>x.id===currentId);}
function openDetail(id){currentId=id;const b=getB();if(!b){go('budgets');return;}go('detail');renderDetail();}
function renderDetail(){const b=getB();const{sub,total,d}=calc(b.items,b.desconto);const c=clientObj(b);
 const byCat=totalsByCat(b.items);const hasCat=b.items.some(i=>i.cat&&i.cat!=='outros')&& (byCat.material>0||byCat.mao_obra>0);
 const logo=DB.pro.logo?`<img src="${esc(DB.pro.logo)}" style="max-height:52px;border-radius:8px">`:'';
 $('#detail-sheet').innerHTML=`<small class="mut">Orçamento <b>#${b.number}</b> · ${STATUS[b.status]} · emitido em ${new Date(b.createdAt).toLocaleDateString('pt-BR')}</small>
 <div class="row"><div>${logo}</div><div><h2>${esc(DB.pro.nome||'Orçamento')} ${DB.pro.cidade?'· '+esc(DB.pro.cidade):''}</h2>
 <p class="mut">${esc(DB.pro.fone||'')}${DB.pro.email?' · '+esc(DB.pro.email):''}${DB.pro.doc?' · '+esc(DB.pro.doc):''}</p></div></div><hr>
 <p><b>Cliente:</b> ${esc(c?c.nome:'Avulso')}<br>${c&&c.fone?esc(c.fone)+'<br>':''}<b>Obra:</b> ${esc(b.obra||'—')}<br><small>${esc(b.endereco||'')}</small></p>
 <table class="items"><tr><th>Serviço</th><th class="n">Qtd</th><th class="n">Total</th></tr>
 ${b.items.map(i=>`<tr><td>${esc(i.nome)} <span class="cat">${CATS[i.cat]||''}</span><br><small>${i.qtd} ${esc(i.un)} × ${BRL(i.unit)}</small></td><td class="n">${i.qtd}</td><td class="n">${BRL(i.qtd*i.unit)}</td></tr>`).join('')}</table>
 ${hasCat?`<p><small>Mão de obra: ${BRL(byCat.mao_obra)} · Material: ${BRL(byCat.material)} · Outros: ${BRL(byCat.outros)}</small></p>`:''}
 <p>Subtotal: ${BRL(sub)}<br>Desconto: ${BRL(d)}<br><b style="font-size:18px">Total: ${BRL(total)}</b><br><small>Prazo: ${esc(b.prazo||'—')} · Validade: ${b.validade||'—'} dias (até ${validUntil(b)})<br>Pagamento: ${esc(b.pag||'—')}<br>${esc(b.obs||'')}</small></p>
 <p class="mut">Assinatura do cliente: ________________________________</p>`;
 const st=$('#dt-status');st.innerHTML=Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${k===b.status?'selected':''}>${v}</option>`).join('');
 st.onchange=()=>{b.status=st.value;b.updatedAt=Date.now();save();toast('Status: '+STATUS[b.status]);renderBudgets()};
 $('#dt-pdf-wa').style.display=isMobile?'':'none';}
$('#dt-edit').onclick=()=>{const b=getB();editingId=b.id;_wzStart=Date.now();draft={clientId:b.clientId,obra:b.obra,endereco:b.endereco,items:JSON.parse(JSON.stringify(b.items)),desconto:b.desconto,prazo:b.prazo,validade:b.validade,pag:b.pag,obs:b.obs,status:b.status};go('wizard');};
$('#dt-duplicate').onclick=()=>{const b=getB();const n={...JSON.parse(JSON.stringify(b)),id:uid(),number:nextNumber(),status:'rascunho',createdAt:Date.now(),updatedAt:Date.now()};delete n.ex;DB.budgets.push(n);DB.metrics.dups+=1;save();toast('Duplicado como #'+n.number);openDetail(n.id);};
$('#dt-delete').onclick=()=>{if(!confirm('Excluir este orçamento?'))return;DB.budgets=DB.budgets.filter(x=>x.id!==currentId);save();go('budgets');};
$('#dt-pdf').onclick=()=>gerarPDF();
$('#dt-pdf-wa').onclick=()=>{_pdfThenWa=true;gerarPDF();toast('Salve o PDF e anexe no WhatsApp');};
$('#dt-wa').onclick=()=>openShare('wa'); $('#dt-mail').onclick=()=>openShare('mail');

function pdfHTML(b){const{sub,total,d}=calc(b.items,b.desconto);const c=clientObj(b);const byCat=totalsByCat(b.items);
 const logo=DB.pro.logo?`<img src="${esc(DB.pro.logo)}" style="max-height:60px">`:'';
 return `<div class="pdf"><header><div><h2>${logo} ${esc(DB.pro.nome||'ObraFácil')}</h2><small>${esc(DB.pro.fone||'')} ${esc(DB.pro.email||'')} ${esc(DB.pro.cidade||'')} ${DB.pro.doc?'· '+esc(DB.pro.doc):''}</small></div><div style="text-align:right"><b>ORÇAMENTO #${b.number}</b><br><small>Emissão: ${new Date(b.createdAt).toLocaleDateString('pt-BR')}<br>Validade: ${b.validade||30} dias (até ${validUntil(b)})</small></div></header>
 <p><b>Cliente:</b> ${esc(c?c.nome:'—')} ${c&&c.fone?'· '+esc(c.fone):''}<br><b>Obra:</b> ${esc(b.obra||'—')} — ${esc(b.endereco||'')}<br><b>Status:</b> ${STATUS[b.status]}</p>
 <table><tr><th>#</th><th>Serviço / Material</th><th>Cat.</th><th>Qtd</th><th class="right">Vlr unit.</th><th class="right">Total</th></tr>
 ${b.items.map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.nome)} <small>(${esc(it.un)})</small></td><td>${CATS[it.cat]||'—'}</td><td>${it.qtd} ${esc(it.un)}</td><td class="right">${BRL(it.unit)}</td><td class="right">${BRL(it.qtd*it.unit)}</td></tr>`).join('')}</table>
 <p class="right">Subtotal: ${BRL(sub)}<br>Desconto: ${BRL(d)}<br class="total"><b>TOTAL: ${BRL(total)}</b><br><small>Mão de obra ${BRL(byCat.mao_obra)} · Material ${BRL(byCat.material)} · Outros ${BRL(byCat.outros)}</small></p>
 <p><b>Prazo estimado:</b> ${esc(b.prazo||'A combinar')}<br><b>Pagamento:</b> ${esc(b.pag||'A combinar')}<br><b>Observações:</b> ${esc(b.obs||'—')}</p>
 <br><br><p>___________________________________<br><small>Assinatura / aceite do cliente — ${esc(c?c.nome:'')}</small></p>
 <p><small>Obrigado pela oportunidade! Qualquer dúvida estou à disposição. — ${esc(DB.pro.nome||'')}</small></p></div>`;}
const isMobile=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||'ontouchstart'in window||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'');
function gerarPDF(){const b=getB();if(!b)return;$('#print-area').innerHTML=pdfHTML(b);setTimeout(()=>window.print(),50);}
let _pdfThenWa=false;
window.addEventListener('afterprint',()=>{/* RN-08/RN-09: nunca muda status automaticamente */if(_pdfThenWa){_pdfThenWa=false;openShare('wa');}});

// SHARE
// Mensagem profissional: blocos prontos que somem quando o campo está vazio (sem "Desconto: R$ 0,00", sem "Prazo: —")
const DEFAULT_MSG='{cabecalho}\n\n{saudacao}\n{intro}\n\n{itens}\n{totais}\n\n{condicoes}\n\nFico à disposição para qualquer dúvida. Para aprovar, é só responder esta mensagem. 👍\n\n{assinatura}';
// Modelos padrão antigos: quem não personalizou passa para o novo automaticamente
const OLD_DEFAULT_MSGS=['Olá, tudo bem? Conforme conversamos, segue o orçamento dos serviços solicitados. Qualquer dúvida, estou à disposição. Obrigado pela oportunidade!\n\n🧱 *Orçamento #{numero} — {obra}*\nTotal: {total}\nValidade: {validade} dias','Olá, tudo bem? Conforme conversamos, segue o orçamento dos serviços solicitados. Qualquer dúvida, estou à disposição. Obrigado pela oportunidade!\n\n*Orçamento #{numero} — {obra}*\n{itens}\nSubtotal: {subtotal}\nDesconto: {desconto}\n*Total: {total}*\nValidade: {validade} dias'];
const FOLLOW_MSG='Olá, {cliente}! Tudo bem?\n\nPassando para saber se você conseguiu analisar o *orçamento nº {numero}* ({obra}), no valor de *{total}*.\n\nSe quiser ajustar alguma coisa, é só me falar. Fico à disposição!\n\n{profissional}';
// DB só existe após o login (enterApp → initDB → normalizeDB); nada aqui pode tocar DB no carregamento.
function normalizeDB(){if(!DB.pro)DB.pro={nome:'',fone:'',email:'',cidade:'',doc:'',logo:''};if(!('logo' in DB.pro))DB.pro.logo='';if(!Array.isArray(DB.clients))DB.clients=[];if(!Array.isArray(DB.services))DB.services=[];if(!Array.isArray(DB.budgets))DB.budgets=[];if(!DB.seq)DB.seq=123;if(!DB.settings||typeof DB.settings.msg!=='string')DB.settings={msg:DEFAULT_MSG};if(OLD_DEFAULT_MSGS.includes(DB.settings.msg))DB.settings.msg=DEFAULT_MSG;if(!DB.metrics)DB.metrics={starts:0,finishes:[],shares:{wa:0,mail:0,sys:0},edits:0,dups:0};const m=DB.metrics;if(typeof m.starts!=='number')m.starts=0;if(!Array.isArray(m.finishes))m.finishes=[];if(!m.shares||typeof m.shares!=='object')m.shares={wa:0,mail:0,sys:0};if(typeof m.dups!=='number')m.dups=0;}
const LINE='━━━━━━━━━━━━━━━';
const fmtQ=q=>(+q||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
function msgBlocks(b,total){const c=clientObj(b);const{sub,d}=calc(b.items||[],b.desconto);const P=DB.pro||{};
 const cli=c?c.nome:(b.clientName&&b.clientName!=='Cliente avulso'?b.clientName:'');
 const cabecalho=['📋 *ORÇAMENTO Nº '+b.number+'*',P.nome?'*'+P.nome+'*'+(P.cidade?' · '+P.cidade:''):'','Emitido em '+new Date(b.createdAt||Date.now()).toLocaleDateString('pt-BR')].filter(Boolean).join('\n');
 const saudacao=cli?'Olá, *'+cli+'*! Tudo bem?':'Olá! Tudo bem?';
 const intro=(b.obra?'Conforme conversamos, segue o orçamento para *'+b.obra+'*.':'Conforme conversamos, segue o orçamento dos serviços solicitados.')+(b.endereco?'\n📍 '+b.endereco:'');
 const itens=[LINE,'🛠️ *SERVIÇOS*',LINE,...(b.items||[]).map((it,i)=>{const t=BRL((+it.qtd||0)*(+it.unit||0));
  return '*'+(i+1)+'. '+it.nome+'*\n'+(it.un==='fechado'?'    Valor fechado: *'+t+'*':'    '+fmtQ(it.qtd)+' '+it.un+' × '+BRL(it.unit)+' = *'+t+'*');})].join('\n');
 const totais=[LINE,d>0?'Subtotal: '+BRL(sub)+'\nDesconto: − '+BRL(d):'','💰 *TOTAL: '+BRL(total)+'*',LINE].filter(Boolean).join('\n');
 const condicoes=[b.prazo?'📅 *Prazo:* '+b.prazo:'',b.pag?'💳 *Pagamento:* '+b.pag:'','⏳ *Validade:* '+(b.validade||30)+' dias (até '+validUntil(b)+')',b.obs?'📝 *Obs.:* '+b.obs:''].filter(Boolean).join('\n');
 const assinatura=['Atenciosamente,',P.nome?'*'+P.nome+'*':'',[P.fone?'📞 '+P.fone:'',P.email?'✉️ '+P.email:''].filter(Boolean).join(' · '),P.doc?'CPF/CNPJ: '+P.doc:''].filter(Boolean).join('\n');
 return{cabecalho,saudacao,intro,itens,totais,condicoes,assinatura,cliente:cli||'Cliente',obra:b.obra||'',numero:b.number||'',total:BRL(total),subtotal:BRL(sub),desconto:BRL(d),validade:String(b.validade||30),profissional:P.nome||''};}
function fillTpl(t,b,total){const m=msgBlocks(b,total);
 return String(t||'').replace(/\{(cabecalho|saudacao|intro|itens|totais|condicoes|assinatura|cliente|obra|numero|total|subtotal|desconto|validade|profissional)\}/g,(_,k)=>m[k]).replace(/\n{3,}/g,'\n\n').trim();}
// Prévia igual ao WhatsApp: *negrito* e _itálico_
function waHTML(t){return esc(t).replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g,'$1<i>$2</i>');}
const plainText=t=>String(t).replace(/\*([^*\n]+)\*/g,'$1');
function openShare(how){const b=getB();if(!b)return;go('share');const{total}=calc(b.items,b.desconto);const c=clientObj(b);
 const resumo=fillTpl(DB.settings.msg,b,total);
 $('#share-msg').innerHTML='<div class="msg-bubble">'+waHTML(resumo)+'</div>';$('#share-info').textContent=`${c?c.nome:(b.clientName||'')} · Total ${BRL(total)} — toque em Gerar PDF na tela anterior e anexe o arquivo aqui.`;
 $('#sh-wa').onclick=()=>{DB.metrics.shares.wa+=1;mSave();const phone=(c&&c.fone||'').replace(/\D/g,'');const url=`https://wa.me/${phone? '55'+phone.replace(/^55/,'') : ''}?text=${encodeURIComponent(resumo)}`;window.open(url,'_blank');};
 $('#sh-mail').onclick=()=>{DB.metrics.shares.mail+=1;mSave();const to=c&&c.email?c.email:'';window.location.href=`mailto:${to}?subject=${encodeURIComponent('Orçamento #'+b.number+' — '+(b.obra||''))}&body=${encodeURIComponent(plainText(resumo))}`;};
 $('#sh-copy').onclick=async()=>{try{await navigator.clipboard.writeText(resumo);toast('Mensagem copiada ✔');}catch{toast('Não foi possível copiar');}};
 $('#sh-sys').onclick=async()=>{if(navigator.share){try{await navigator.share({title:'Orçamento #'+b.number,text:resumo});DB.metrics.shares.sys+=1;mSave();}catch{}}else{toast('Use WhatsApp ou e-mail');}};
 // RN-08: só marca como enviado com toque explícito do usuário, nunca automático
 const _mk=$('#sh-mark');_mk.style.display=b.status==='rascunho'?'':'none';
 _mk.onclick=()=>{b.status='enviado';b.updatedAt=Date.now();save();toast('Marcado como enviado ✔');_mk.style.display='none';};
 if(how==='wa')$('#sh-wa').focus();}

// VALIDADE
function validUntil(b){try{return new Date(b.createdAt+(+b.validade||0)*86400000).toLocaleDateString('pt-BR');}catch{return '—';}}

// INSTALAR APP (PWA): Android/Chrome usa o convite do navegador; iPhone e demais recebem o passo a passo
let _deferredInstall=null;
const isStandalone=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
// Já instalado: o cartão vira atalho para Meus Dados (a grade continua com 4 cartões)
function renderInstallCard(){const b=$('#btn-install');const done=isStandalone();b.dataset.mode=done?'pro':'install';
 $('#install-title').textContent=done?'Meus Dados':'Instalar app';$('#install-sub').textContent=done?'Perfil e mensagem':'Ícone na tela do celular';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_deferredInstall=e;});
window.addEventListener('appinstalled',()=>{_deferredInstall=null;toast('App instalado ✔ — abra pelo ícone na tela');renderInstallCard();});
$('#btn-install').onclick=async()=>{if($('#btn-install').dataset.mode==='pro'){go('pro');return;}
 if(_deferredInstall){const ev=_deferredInstall;_deferredInstall=null;ev.prompt();try{await ev.userChoice;}catch{}return;}
 showInstallHelp();};
function showInstallHelp(){
 const steps=isIOS?['Abra este site no <b>Safari</b> (no Chrome do iPhone também funciona).','Toque em <b>Compartilhar</b> — o quadrado com a seta para cima ⬆️.','Role a lista e toque em <b>Adicionar à Tela de Início</b>.','Toque em <b>Adicionar</b>. O ícone do ObraFácil aparece junto dos seus apps.']
  :isMobile?['Toque no menu <b>⋮</b> (três pontinhos) no canto de cima do navegador.','Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.','Confirme em <b>Instalar</b>. O ícone do ObraFácil aparece junto dos seus apps.']
  :['Abra <b>'+esc(location.host)+'</b> no navegador do celular e toque em <b>Instalar app</b> por lá.','No computador (Chrome/Edge): clique no ícone de instalar ⊕ no fim da barra de endereço.'];
 openModal('Instalar no celular','<ol class="install-steps">'+steps.map(t=>'<li>'+t+'</li>').join('')+'</ol><p class="hint">Depois de instalado, o app abre em tela cheia, como um aplicativo, e funciona mesmo sem internet.</p>',()=>{$('#modal').hidden=true;},'Entendi');}
// AUTH — login, sessão, recuperação (PRD §5 RF04–RF08, US01–US03)
// SYNC — cópia na nuvem (tabela obrafacil_data, 1 linha por usuário, RLS; SQL em supabase/obrafacil_data.sql).
// Última gravação vence (DB.updatedAt). Sem internet ou sem tabela, o app segue 100% local.
const SYNC_TABLE='obrafacil_data';
let _syncT=null,_syncBusy=false,_syncAgain=false,_syncOff=false,_syncState='';
function setSync(s){_syncState=s;const el=$('#sync-status');if(el)el.textContent={ok:'Nuvem: tudo salvo ✔',pend:'Nuvem: alterações pendentes (sem internet) — salvas no celular',off:'Nuvem: indisponível — dados só neste celular (faça Backup)',busy:'Nuvem: salvando...'}[s]||'';}
function canSync(){return !!(supa&&authUser&&!authUser.offline&&!_syncOff&&DB);}
function syncFail(e){const msg=String((e&&(e.message||e.code))||e);
 if(/PGRST205|42P01|does not exist|schema cache|404/i.test(msg+' '+(e&&e.code||''))){_syncOff=true;setSync('off');console.warn('[ObraFácil] tabela '+SYNC_TABLE+' não existe — rode supabase/obrafacil_data.sql');return;}
 setSync('pend');console.warn('[ObraFácil] sync falhou:',msg);}
function queueSync(){if(!canSync())return;clearTimeout(_syncT);_syncT=setTimeout(syncPush,1500);}
async function syncPush(){if(!canSync())return;if(_syncBusy){_syncAgain=true;return;}_syncBusy=true;setSync('busy');
 const uidNow=authUser.id;
 try{const{error}=await supa.from(SYNC_TABLE).upsert({user_id:uidNow,data:DB,updated_at:new Date().toISOString()});if(error)throw error;if(sameUser(uidNow))setSync('ok');}
 catch(e){if(sameUser(uidNow))syncFail(e);}
 _syncBusy=false;if(_syncAgain){_syncAgain=false;queueSync();}}
// União por id (nuvem vence no conflito) — só para dados antigos sem carimbo de hora, para não perder nada.
function mergeDB(local,remote){const out=JSON.parse(JSON.stringify(remote));
 ['clients','services','budgets'].forEach(k=>{const ids=new Set((out[k]||[]).map(x=>x.id));(local[k]||[]).forEach(x=>{if(!x.ex&&!ids.has(x.id))(out[k]=out[k]||[]).push(x);});});
 out.seq=Math.max(+local.seq||0,+remote.seq||0);if(!out.pro||!out.pro.nome)out.pro=local.pro;return out;}
// Resposta que chega depois de sair/trocar de conta é descartada: dados de um usuário nunca caem em outro.
const sameUser=id=>!!(authUser&&authUser.id===id&&DB);
async function syncPull(){if(!canSync())return;const uidNow=authUser.id;
 try{const{data,error}=await supa.from(SYNC_TABLE).select('data').eq('user_id',uidNow).maybeSingle();if(!sameUser(uidNow))return;if(error)throw error;
  const remote=data&&data.data;const lts=+DB.updatedAt||0,rts=remote?(+remote.updatedAt||0):0;
  if(!remote){await syncPush();return;}
  if(rts>lts){const merge=!lts&&!_freshSeed;DB=merge?mergeDB(DB,remote):remote;_freshSeed=false;if(merge)DB.updatedAt=Date.now();normalizeDB();saveLocal();
   if(['home','budgets','clients','services','pro'].includes(route))go(route);
   if(merge)await syncPush();else setSync('ok');}
  else if(lts>rts)await syncPush();else setSync('ok');}
 catch(e){syncFail(e);}}
// Voltou a internet: se entrou offline, confirma a sessão antes de sincronizar.
window.addEventListener('online',async()=>{if(!authUser||!supa)return;
 if(authUser.offline){try{const{data}=await supa.auth.getSession();if(data&&data.session&&data.session.user.id===authUser.id)authUser.offline=false;else return;}catch{return;}}
 if(_syncState==='pend'||_syncState==='')syncPull();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authUser)syncPull();});

const LAST_USER='obrafacil_last_user';
function enterApp(user,offline){authUser={id:user.id,email:user.email,offline:!!offline};KEY='obrafacil_v1_'+user.id;editingId=null;currentId=null;
 try{localStorage.setItem(LAST_USER,JSON.stringify({id:user.id,email:user.email}));}catch{}
 try{const legacy=JSON.parse(localStorage.getItem('obrafacil_v1'));if(legacy&&legacy.budgets&&!localStorage.getItem(KEY)){localStorage.setItem(KEY,JSON.stringify(legacy));}}catch{}
 try{localStorage.removeItem('obrafacil_v1');}catch{}
 _syncOff=false;setSync(offline?'pend':'');
 initDB();draft={clientId:'',obra:'',endereco:'',items:[],desconto:0,prazo:'',validade:30,pag:'50% na entrada e 50% na conclusão',obs:'',status:'rascunho'};try{window._logged=true;}catch(e){}go('home');
 syncPull();}
// Sair: envia o que estiver pendente, encerra a sessão e esquece o último usuário deste aparelho.
async function logout(){clearTimeout(_syncT);if(canSync()&&navigator.onLine){try{await syncPush();}catch{}}
 try{if(supa)await supa.auth.signOut();}catch{}try{localStorage.removeItem(LAST_USER);}catch{}
 authUser=null;DB=null;KEY='obrafacil_v1';$('#pw-box').hidden=true;try{window._logged=false;}catch(e){}go('login');}
function loginErr(m){const e=$('#login-err');e.textContent=m||'';}
function mapAuthError(e){const m=String((e&&e.message)||'');if(/banned|blocked|suspended|disabled/i.test(m))return 'Acesso bloqueado. Fale com o responsável.';return 'E-mail ou senha inválidos.';} // RF06
const _fails=[]; // timestamps de falhas (sessão) — freio local anti-automação
function canTry(){const now=Date.now();while(_fails.length&&now-_fails[0]>10*60*1000)_fails.shift();const r=_fails.filter(t=>now-t<60*1000);return r.length<5?0:Math.ceil(60-(now-r[0])/1000);}
function eyeToggle(btnId,inputId){const b=$('#'+btnId),i=$('#'+inputId);b.onclick=()=>{const show=i.type==='password';i.type=show?'text':'password';b.textContent=show?'Ocultar':'Mostrar';};}
eyeToggle('login-eye','login-pass');eyeToggle('rec-eye1','rec-pass1');eyeToggle('rec-eye2','rec-pass2');eyeToggle('sup-eye','sup-pass');
// Validação (skills email+password / frontend) — feedback imediato, sem vazar dados
const EMAIL_RE=/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const normEmail=e=>String(e||'').trim().toLowerCase();
const emailOk=e=>e.length>0&&e.length<=254&&EMAIL_RE.test(e);
function mark(el,bad){if(!el)return;el.classList.toggle('field-err',!!bad);if(bad)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid');}
function pwScore(p){let s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[0-9]/.test(p)&&/[a-zA-Z]/.test(p))s++;if(/[^a-zA-Z0-9]/.test(p)&&p.length>=10)s++;return Math.min(3,s);}
const PW_TXT=['Muito curta','Fraca','Razoável','Boa'];
function wireStrength(inputId,meterId,labelId){const i=$('#'+inputId);if(!i)return;i.addEventListener('input',()=>{const s=i.value?pwScore(i.value):0;const m=$('#'+meterId);if(m){m.className='pw-meter m'+s;}const l=$('#'+labelId);if(l)l.textContent=i.value?('Senha '+PW_TXT[s]):'';});}
function wireCaps(inputId,hintId){const i=$('#'+inputId);if(!i)return;i.addEventListener('keyup',e=>{let on=false;try{on=e.getModifierState&&e.getModifierState('CapsLock');}catch(err){}const h=$('#'+hintId);if(h)h.hidden=!on;});}
function wireEnter(inputId,btnId){const i=$('#'+inputId);if(i)i.addEventListener('keydown',e=>{if(e.key==='Enter')$('#'+btnId).click();});}
function wireEmailBlur(inputId){const i=$('#'+inputId);if(i)i.addEventListener('blur',()=>{const v=normEmail(i.value);if(v)mark(i,!emailOk(v));});}
wireStrength('sup-pass','sup-meter','sup-strength');wireStrength('rec-pass1','rec-meter','rec-strength');
wireCaps('login-pass','login-caps');wireCaps('sup-pass','sup-caps');wireCaps('rec-pass1','rec-caps');
wireEnter('login-email','login-go');wireEnter('login-pass','login-go');
wireEnter('sup-email','sup-go');wireEnter('sup-pass','sup-go');wireEnter('sup-pass2','sup-go');
wireEnter('rec-email','rec-send');wireEnter('rec-pass1','rec-save');wireEnter('rec-pass2','rec-save');
wireEmailBlur('login-email');wireEmailBlur('sup-email');wireEmailBlur('rec-email');
$('#login-go').onclick=async()=>{
 loginErr('');
 const emailEl=$('#login-email'),passEl=$('#login-pass');
 const email=normEmail(emailEl.value),pass=passEl.value;
 mark(emailEl,false);mark(passEl,false);
 if(!email||!pass){loginErr('Informe e-mail e senha.');mark(emailEl,!email);mark(passEl,!pass);(email?passEl:emailEl).focus();return;} // RF08
 if(!emailOk(email)){loginErr('Confira o formato do e-mail.');mark(emailEl,true);emailEl.focus();return;} // RF08
 if(pass.length>128){loginErr('Senha muito longa.');mark(passEl,true);return;}
 const wait=canTry();if(wait){loginErr(`Muitas tentativas. Aguarde ${wait}s e tente de novo.`);return;}
 if(!supa){loginErr('Login indisponível: sem conexão ou backend não configurado.');return;}
 const btn=$('#login-go');btn.disabled=true;btn.textContent='Entrando...';
 const m=aMetrics();m.attempts++;const t0=Date.now();
 try{
  const {data,error}=await supa.auth.signInWithPassword({email,password:pass}); // RF04
  if(error)throw error;
  m.ok++;m.times.push(Math.round((Date.now()-t0)/1000));if(m.times.length>50)m.times.shift();aSave(m);
  enterApp(data.user); // RF05
 }catch(e){m.fail++;_fails.push(Date.now());aSave(m);loginErr(mapAuthError(e));} // RF06
 btn.disabled=false;btn.textContent='Entrar';
};
// Abre a recuperação sempre na etapa 1 (pedir link), já com o e-mail digitado no login
function openRecoveryRequest(msg){go('recovery');$('#rec-req').hidden=false;$('#rec-set').hidden=true;
 const e=normEmail($('#login-email').value);if(e)$('#rec-email').value=e;
 const m=$('#rec-msg');m.classList.remove('ok');m.textContent=msg||'';$('#rec-send').disabled=false;}
// Link do e-mail aberto: mostra a etapa 2 (nova senha) com a sessão temporária
function openRecoverySet(){go('recovery');$('#rec-req').hidden=true;$('#rec-set').hidden=false;
 $('#rec-pass1').value='';$('#rec-pass2').value='';$('#rec-msg2').textContent='';$('#rec-save').disabled=false;}
$('#login-forgot').onclick=()=>openRecoveryRequest();
$('#login-signup').onclick=()=>{const b=$('#sup-box');b.hidden=!b.hidden;const m=$('#sup-msg');m.textContent='';m.classList.remove('ok');};
$('#sup-go').onclick=async()=>{
 const box=$('#sup-msg');box.classList.remove('ok');box.textContent='';
 const emailEl=$('#sup-email'),p1=$('#sup-pass'),p2=$('#sup-pass2');
 const email=normEmail(emailEl.value),a=p1.value,b=p2.value;
 [emailEl,p1,p2].forEach(e=>mark(e,false));
 if(!emailOk(email)){box.textContent='Informe um e-mail válido.';mark(emailEl,true);emailEl.focus();return;}
 if(a.length<6){box.textContent='A senha precisa de ao menos 6 caracteres.';mark(p1,true);p1.focus();return;}
 if(a.length>72){box.textContent='Use uma senha de até 72 caracteres.';mark(p1,true);return;}
 if(a!==b){box.textContent='As senhas não conferem.';mark(p2,true);p2.focus();return;}
 if(!supa){box.textContent='Indisponível: sem conexão ou backend não configurado.';return;}
 const btn=$('#sup-go');btn.disabled=true;btn.textContent='Criando...';
 const m=aMetrics();m.attempts++;
 try{
  // Cadastro simples: sem confirmação por e-mail, a conta já entra na hora.
  const {data,error}=await supa.auth.signUp({email,password:a});
  if(error)throw error;
  // E-mail já cadastrado volta sem erro e sem identidades (quando o servidor ainda exige confirmação).
  if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0)throw new Error('already registered');
  let user=data.session&&data.session.user;
  if(!user){const r=await supa.auth.signInWithPassword({email,password:a});if(r.error)throw r.error;user=r.data.user;}
  m.ok++;aSave(m);
  [p1,p2].forEach(e=>e.value='');
  enterApp(user);toast('Conta criada ✔');
 }catch(e){
  m.fail++;aSave(m);
  const msg=String((e&&e.message)||'');
  box.textContent=/not allowed|disabled/i.test(msg)?'Criação de contas desativada. Fale com o responsável.'
   :/already|registered|exists|duplicate/i.test(msg)?'Este e-mail já tem conta. Use Entrar ou Esqueci minha senha.'
   :/not confirmed/i.test(msg)?'Conta criada, mas o servidor ainda exige confirmação por e-mail. O responsável precisa desligar "Confirm email" no Supabase.'
   :/rate|limit|too many|429/i.test(msg)?'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
   :/weak|password/i.test(msg)?'Senha fraca. Use ao menos 6 caracteres, misturando letras e números.'
   :/fetch|network/i.test(msg)?'Sem conexão. Tente de novo.':'Não foi possível criar a conta. Tente de novo.';
 }
 btn.disabled=false;btn.textContent='Criar minha conta';
};
// Recuperação (RF07/US03) — etapa 1: pedir link por e-mail
$('#rec-send').onclick=async()=>{
 const emailEl=$('#rec-email'),email=normEmail(emailEl.value);
 mark(emailEl,false);$('#rec-msg').classList.remove('ok');$('#rec-msg').textContent='';
 if(!emailOk(email)){$('#rec-msg').textContent='Informe um e-mail válido.';mark(emailEl,true);emailEl.focus();return;}
 if(!supa){$('#rec-msg').textContent='Indisponível: sem conexão ou backend não configurado.';return;}
 const btnSend=$('#rec-send');btnSend.disabled=true;
 const redirectTo=location.origin+location.pathname;
 try{
  const{error}=await supa.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error;
 }catch(e){
  const msg=String((e&&e.message)||'');
  $('#rec-msg').textContent=/redirect/i.test(msg)?'Recuperação mal configurada no servidor. Avise o responsável.':/rate|limit|too many|429|exceeded/i.test(msg)?'Muitos e-mails enviados. Aguarde 1 hora e tente de novo.':'Sem conexão. Tente de novo.';
  btnSend.disabled=false;return;
 }
 btnSend.disabled=false;
 const m=aMetrics();m.rec++;aSave(m);
 const rm=$('#rec-msg');rm.classList.add('ok');
 rm.textContent='Pronto! Se o e-mail estiver cadastrado, chega um link em instantes (veja também o spam). Abra o link e escolha a nova senha.'; // US03: sem revelar cadastro
};
// Troca de senha (usada pelo link de recuperação e por "Alterar senha" em Meus Dados)
function pwErrMsg(e){const msg=String((e&&e.message)||'');
 if(/different from the old|same/i.test(msg))return 'A nova senha precisa ser diferente da atual.';
 if(/weak|at least|characters/i.test(msg))return 'Senha fraca. Use ao menos 6 caracteres, misturando letras e números.';
 if(/session|expired|jwt|not authenticated/i.test(msg))return 'Sessão expirada. Peça um novo link em Esqueci minha senha.';
 if(/fetch|network/i.test(msg))return 'Sem conexão. Tente de novo.';
 return 'Não foi possível trocar a senha. Tente de novo.';}
async function changePassword(p1,p2,msgEl,btn){
 const a=p1.value,b=p2.value;msgEl.classList.remove('ok');msgEl.textContent='';
 mark(p1,false);mark(p2,false);
 if(a.length<6){msgEl.textContent='A senha precisa de ao menos 6 caracteres.';mark(p1,true);p1.focus();return null;}
 if(a.length>72){msgEl.textContent='Use uma senha de até 72 caracteres.';mark(p1,true);return null;}
 if(a!==b){msgEl.textContent='As senhas não conferem.';mark(p2,true);p2.focus();return null;}
 if(!supa||!navigator.onLine){msgEl.textContent='Sem conexão. Conecte-se à internet para trocar a senha.';return null;}
 const label=btn.textContent;btn.disabled=true;btn.textContent='Salvando...';
 try{const{data,error}=await supa.auth.updateUser({password:a});if(error)throw error;p1.value='';p2.value='';return data.user;}
 catch(e){msgEl.textContent=pwErrMsg(e);return null;}
 finally{btn.disabled=false;btn.textContent=label;}}
// Recuperação — etapa 2: definir nova senha (link do e-mail) e entrar
$('#rec-save').onclick=async()=>{
 const user=await changePassword($('#rec-pass1'),$('#rec-pass2'),$('#rec-msg2'),$('#rec-save'));
 if(user){enterApp(user);toast('Senha alterada ✔');}
};
// Alterar senha já logado (Meus Dados → Conta)
eyeToggle('pw-eye','pw-new1');wireEnter('pw-new2','pw-save');
$('#btn-pw-toggle').onclick=()=>{const b=$('#pw-box');b.hidden=!b.hidden;$('#pw-new1').value='';$('#pw-new2').value='';const m=$('#pw-msg');m.textContent='';m.classList.remove('ok');if(!b.hidden)$('#pw-new1').focus();};
$('#pw-save').onclick=async()=>{
 if(!authUser||authUser.offline){$('#pw-msg').textContent='Sem conexão. Conecte-se à internet para trocar a senha.';return;}
 const user=await changePassword($('#pw-new1'),$('#pw-new2'),$('#pw-msg'),$('#pw-save'));
 if(user){const m=$('#pw-msg');m.classList.add('ok');m.textContent='Senha alterada ✔ Use a nova senha no próximo login.';toast('Senha alterada ✔');}
};
const CFG_KEY='obrafacil_cfg'; // última config válida do backend, para abrir sem internet
function lastUser(){try{const u=JSON.parse(localStorage.getItem(LAST_USER));return u&&u.id?u:null;}catch{return null;}}
async function bootAuth(){
 window._cfgWhy='';
 // Lido antes de criar o cliente: o Supabase limpa o #hash do link ao processá-lo.
 const isRecovery=/type=recovery/.test(location.hash||'');
 try{ // chaves via servidor (deploy); auth-config.js local continua como alternativa
  if(location.protocol==='file:'){window._cfgWhy='abrindo-arquivo-local-use-o-link-https';}
  else{
   const r=await fetch('api/config');
   if(!r.ok){window._cfgWhy='http-'+r.status;}
   else{let j=null;try{j=await r.json();}catch(e){window._cfgWhy='resposta-invalida';}
    if(j&&j.url&&j.anonKey){if(!authConfigured())window.OBRAFACIL_AUTH={url:j.url,anonKey:j.anonKey};try{localStorage.setItem(CFG_KEY,JSON.stringify({url:j.url,anonKey:j.anonKey}));}catch{}}
    else if(!window._cfgWhy)window._cfgWhy='resposta-vazia';}
  }
 }catch(e){if(!window._cfgWhy)window._cfgWhy='fetch-falhou';}
 if(!authConfigured()){try{const c=JSON.parse(localStorage.getItem(CFG_KEY));if(c&&c.url&&c.anonKey){window.OBRAFACIL_AUTH=c;window._cfgWhy='';}}catch{}}
 renderLoginStatic();
 if(!initAuth()){const u=lastUser();if(u&&!navigator.onLine){enterApp(u,true);return;}go('login');return;}
 // Sessão expirada/revogada em outro lugar: volta ao login
 supa.auth.onAuthStateChange(ev=>{if(ev==='PASSWORD_RECOVERY'){setTimeout(openRecoverySet,0);return;}
  if(ev==='SIGNED_OUT'&&authUser){authUser=null;DB=null;KEY='obrafacil_v1';try{window._logged=false;}catch(e){}setTimeout(()=>go('login'),0);}});
 let session=null,sessErr=null;
 try{const{data,error}=await supa.auth.getSession();session=data&&data.session;sessErr=error;}catch(e){sessErr=e;}
 // Link de recuperação: abre a troca de senha com a sessão temporária
 if(isRecovery&&session){history.replaceState(null,'',location.pathname);openRecoverySet();return;}
 // Link com erro (expirado/já usado, ex: otp_expired): explica e já abre o pedido de um link novo
 if(/error=|error_code=/.test(location.hash||'')||/error=/.test(location.search||'')){history.replaceState(null,'',location.pathname);openRecoveryRequest('Link expirado ou já usado. Peça um novo link abaixo — vale só o mais recente.');return;}
 // Sessão guardada neste aparelho (inclui volta do link de confirmação de cadastro): entra direto
 if(session){if(location.hash)history.replaceState(null,'',location.pathname);enterApp(session.user);return;}
 // Sem internet e sessão não pôde ser renovada: entra com o último usuário deste aparelho (dados são locais)
 const u=lastUser();if(u&&!navigator.onLine){enterApp(u,true);return;}
 if(sessErr)console.warn('[ObraFácil] sessão:',sessErr.message||sessErr);
 go('login');
}
function authStatus(){if(!navigator.onLine)return 'sem internet';if(!window.supabase)return 'biblioteca indisponível';const c=window.OBRAFACIL_AUTH||{};if(!c.url||!c.anonKey)return 'backend não configurado'+(window._cfgWhy?' (detalhe: '+window._cfgWhy+')':'');return '';}
function renderLoginStatic(){$('#login-email').value='';$('#login-pass').value='';$('#login-pass').type='password';$('#login-eye').textContent='Mostrar';loginErr('');$('#sup-box').hidden=true;const s=authStatus();$('#login-noconf').hidden=!s;if(s)$('#login-noconf').querySelector('.hint').innerHTML='<b>Login indisponível:</b> '+esc(s)+'. Conecte-se à internet e atualize o app. Se persistir, remova este app e instale pelo link oficial: <b>obrafacil-orcamentos.vercel.app</b>';}
// Diagnóstico: 5 toques no carimbo de versão mostram cfg/lib/rede
(function(){let n=0,t=0;const v=$('#appver');if(v&&v.addEventListener)v.addEventListener('click',()=>{const now=Date.now();n=now-t<1500?n+1:1;t=now;if(n>=5){n=0;const c=(window.OBRAFACIL_AUTH||{});toast('diag cfg:'+(c.url?'ok':(window._cfgWhy||'falta'))+' lib:'+(window.supabase?'ok':'falta')+' net:'+(navigator.onLine?'on':'off')+' host:'+location.host);}});})();
function updOnline(){$('#offline-bar').hidden=navigator.onLine;}
window.addEventListener('online',updOnline);window.addEventListener('offline',updOnline);updOnline();

bootAuth();
