/* ============ Constantes ============ */
const AISLES = ["Fruits & légumes","Boucherie & poisson","Crèmerie & œufs","Boulangerie","Épicerie salée","Épicerie sucrée","Condiments & épices","Surgelés","Boissons","Hygiène & maison","Autres"];
const KW = [
 ["Fruits & légumes","tomate carotte oignon échalote ail poireau courgette aubergine poivron salade laitue épinard chou brocoli champignon pomme poire banane citron orange fraise framboise avocat concombre radis patate navet céleri fenouil haricot persil coriandre basilic menthe ciboulette thym romarin gingembre potiron butternut courge mangue ananas kiwi raisin abricot pêche cerise betterave endive asperge artichaut"],
 ["Boucherie & poisson","poulet boeuf veau porc agneau dinde canard steak viande saucisse lardon jambon bacon chorizo merguez poisson saumon cabillaud thon crevette moule colin truite sardine escalope magret"],
 ["Crèmerie & œufs","lait crème beurre oeuf fromage yaourt mozzarella parmesan emmental gruyère comté feta chèvre ricotta mascarpone camembert raclette reblochon skyr"],
 ["Boulangerie","pain baguette brioche tortilla wrap pita"],
 ["Épicerie salée","pâtes spaghetti tagliatelle penne riz semoule quinoa lentille pois farine bouillon conserve coulis chapelure maïs olive cornichon nouille boulgour couscous"],
 ["Épicerie sucrée","sucre chocolat miel confiture levure vanille cacao biscuit céréale sirop amande noisette noix compote"],
 ["Condiments & épices","sel poivre huile vinaigre moutarde mayonnaise ketchup soja paprika cumin curry curcuma cannelle muscade piment laurier origan épice"],
 ["Surgelés","surgelé glace frites"],
 ["Boissons","eau jus vin bière soda café thé"],
 ["Hygiène & maison","papier essuie éponge lessive savon shampoing dentifrice sac"],
];
const MASS={g:1,kg:1000}, VOL={ml:1,cl:10,l:1000};
const COUNTABLE=["pièce","gousse","tranche","botte","sachet","boîte","pot","paquet",""];
const ICON_CHECK='<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>';
const ICON_X='<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/* ============ Utilitaires ============ */
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s||"").toLowerCase().replace(/œ/g,"oe").normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
const keyName=s=>norm(s).replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim().split(" ").map(w=>w.length>3&&/[sx]$/.test(w)?w.slice(0,-1):w).join("_");
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function guessAisle(name){
  const n=" "+norm(name)+" ";
  if(/(^|[^a-z])huile/.test(n))return "Condiments & épices";
  if(n.includes("lait de coco"))return "Épicerie salée";
  if(n.includes("pomme de terre"))return "Fruits & légumes";
  if(/pate (feuilletee|brisee|sablee|a pizza)/.test(n))return "Boulangerie";
  if(/(sauce|coulis|concentre) (de )?tomate|tomates? (concassee|pelee)/.test(n))return "Épicerie salée";
  let best=null,len=0;
  for(const [a,words] of KW)for(const raw of words.split(" ")){
    const w=norm(raw);if(!w)continue;
    if(new RegExp("(^|[^a-z])"+w+"(s|x)?([^a-z]|$)").test(n)&&w.length>len){best=a;len=w.length}
  }
  return best||"Autres";
}
let toastT;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600)}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

/* ============ État ============ */
const state={
  recipes:[], recipesError:false,
  settings:{people:4},
  plan:{items:[],checked:{},have:{},extras:[]},
};

/* ============ Recettes (fichier du dépôt) ============ */
async function loadRecipes(){
  try{
    const res=await fetch("recipes.json?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error(res.status);
    const data=await res.json();
    state.recipes=(Array.isArray(data)?data:[]).filter(r=>r&&r.id&&r.name);
  }catch(e){state.recipesError=true}
  renderAll();
}

/* ============ Stockage sur l'appareil ============ */
const Local={
  get(k,d){try{const v=localStorage.getItem("courses:"+k);return v?JSON.parse(v):d}catch(e){return d}},
  put(k,v){try{localStorage.setItem("courses:"+k,JSON.stringify(v));return true}catch(e){toast("Enregistrement impossible sur cet appareil");return false}}
};
state.settings={...state.settings,...Local.get("settings",{})};
state.plan={...state.plan,...Local.get("plan",{})};
const Store={
  setSettings(s){state.settings={...state.settings,...s};Local.put("settings",state.settings);renderAll()},
  setPlan(p){state.plan=p;Local.put("plan",p);renderAll()},
  patchPlanMap(field,key,val){state.plan={...state.plan,[field]:{...(state.plan[field]||{}),[key]:val}};Local.put("plan",state.plan);renderAll()}
};

/* ============ Navigation ============ */
let tab="menu";
function setTab(t){
  tab=t;$$(".view").forEach(v=>v.classList.toggle("active",v.id==="v-"+t));
  $$("nav.tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  window.scrollTo(0,0);
}
window.setTab=setTab;
$$("nav.tabs button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

/* ============ Liste de courses ============ */
function planRecipes(){
  return (state.plan.items||[]).map(it=>({it,r:state.recipes.find(r=>r.id===it.rid)})).filter(x=>x.r);
}
function buildList(){
  const map=new Map();
  for(const {it,r} of planRecipes()){
    const factor=(it.servings||state.settings.people)/(r.servings||state.settings.people||1);
    for(const ing of (r.ingredients||[])){
      if(!ing.name)continue;
      const unit=ing.unit||"";
      let qty=(ing.qty===null||ing.qty===""||ing.qty===undefined)?null:Number(ing.qty)*factor;
      let fam=unit;
      if(MASS[unit]){if(qty!==null)qty*=MASS[unit];fam="g"}else if(VOL[unit]){if(qty!==null)qty*=VOL[unit];fam="ml"}
      const key=keyName(ing.name)+"__"+keyName(fam||"u");
      let e=map.get(key);
      if(!e){e={key,name:ing.name.trim(),fam,qty:0,hasQty:false,noQty:false,aisle:AISLES.includes(ing.aisle)?ing.aisle:guessAisle(ing.name)};map.set(key,e)}
      if(qty===null||isNaN(qty))e.noQty=true;else{e.qty+=qty;e.hasQty=true}
    }
  }
  for(const x of (state.plan.extras||[])){
    const key="extra__"+x.id;
    map.set(key,{key,name:x.name,fam:"",qty:0,hasQty:false,noQty:false,aisle:x.aisle||guessAisle(x.name),extra:x.id});
  }
  return [...map.values()];
}
function fmtQty(e){
  if(!e.hasQty)return e.noQty?"selon besoin":"";
  let q=e.qty,u=e.fam;
  if(u==="g"){if(q>=1000){q=Math.round(q/10)/100;u="kg"}else q=q>=50?Math.round(q/5)*5:Math.round(q)}
  else if(u==="ml"){if(q>=1000){q=Math.round(q/10)/100;u="l"}else if(q>=100){q=Math.round(q/10);u="cl"}else q=Math.round(q)}
  else if(COUNTABLE.includes(u))q=Math.ceil(q*2-0.001)/2;
  else q=Math.round(q*10)/10;
  const s=String(q).replace(".",",");
  return (u?`${s} ${u}`:s)+(e.noQty?" + selon besoin":"");
}
const clonePlan=()=>JSON.parse(JSON.stringify(state.plan));

/* ============ Rendu ============ */
function renderBanner(){
  let h="";
  if(state.recipesError)h+=`<div class="banner">Impossible de charger les recettes.</div>`;
  $("#banner").innerHTML=h;
}

let drawN=null;
function renderMenu(){
  const items=planRecipes(), n=state.recipes.length;
  if(drawN===null&&n)drawN=Math.min(5,n);
  if(!n){$("#menu-body").innerHTML=`<div class="card empty"><h3>Aucune recette pour l'instant</h3>Envoie tes recettes à Claude pour remplir ton carnet.</div>`;$("#menu-sub").textContent="";return}
  drawN=Math.max(1,Math.min(drawN||1,n));
  let h=`<div class="card menu-pick">
    <div class="sub">Nombre de recettes à tirer</div>
    <div class="stepper big"><button id="dn-minus">−</button><span>${drawN}</span><button id="dn-plus">+</button></div>
    <button class="btn block" id="draw"><svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>${items.length?"Nouveau tirage":"Tirer au sort"}</button>
    <div class="sub">parmi tes ${n} recette${n>1?"s":""}</div></div>`;
  if(items.length){
    h+=`<div class="row" style="margin:22px 2px 10px"><h2 class="grow">Menu de la semaine</h2><button class="btn ghost small" id="add-to-menu">+ Ajouter</button></div><div class="stack">`;
    items.forEach(({it,r},i)=>{
      h+=`<div class="card"><div class="meal"><div class="num">${i+1}</div><div class="grow"><h3>${esc(r.name)}</h3><div class="sub">${r.category?`<span class="tag">${esc(r.category)}</span> `:""}${(r.ingredients||[]).length} ingrédients${r.prepTime?` · ${esc(r.prepTime)} min`:""}</div></div></div>
      <div class="meal-actions">
        <div class="stepper"><button data-sv="${i}" data-d="-1">−</button><span>${it.servings||state.settings.people} pers.</span><button data-sv="${i}" data-d="1">+</button></div>
        <span class="grow"></span>
        <button class="icon-btn" title="Voir" data-view="${esc(r.id)}"><svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="icon-btn" title="Changer" data-swap="${i}"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
        <button class="icon-btn" title="Retirer" data-rm="${i}">${ICON_X}</button>
      </div></div>`;
    });
    h+=`</div><button class="btn block" style="margin-top:16px" onclick="setTab('list')">Voir la liste de courses →</button>`;
  }
  $("#menu-body").innerHTML=h;
  $("#menu-sub").textContent=items.length?`${items.length} recette${items.length>1?"s":""} au menu`:"Combien de recettes cette semaine ?";
  $("#dn-minus").onclick=()=>{drawN=Math.max(1,drawN-1);renderMenu()};
  $("#dn-plus").onclick=()=>{drawN=Math.min(n,drawN+1);renderMenu()};
  $("#draw").onclick=doDraw;
  const add=$("#add-to-menu");if(add)add.onclick=openPicker;
  $$("[data-sv]").forEach(b=>b.onclick=()=>{const p=clonePlan();const it=p.items[+b.dataset.sv];it.servings=Math.max(1,(it.servings||state.settings.people)+(+b.dataset.d));Store.setPlan(p)});
  $$("[data-swap]").forEach(b=>b.onclick=()=>{
    const p=clonePlan();const used=new Set(p.items.map(x=>x.rid));
    const pool=state.recipes.filter(r=>!used.has(r.id));
    if(!pool.length){toast("Pas d'autre recette disponible");return}
    p.items[+b.dataset.swap].rid=shuffle(pool)[0].id;Store.setPlan(p)});
  $$("[data-rm]").forEach(b=>b.onclick=()=>{const p=clonePlan();p.items.splice(+b.dataset.rm,1);Store.setPlan(p)});
  $$("[data-view]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.view));
}
let confirmDraw=false,confirmClear=false;
function doDraw(){
  if(state.plan.items.length&&!confirmDraw){confirmDraw=true;toast("Touche encore pour remplacer le menu actuel");setTimeout(()=>confirmDraw=false,3000);return}
  confirmDraw=false;
  const picks=shuffle(state.recipes).slice(0,drawN);
  Store.setPlan({items:picks.map(r=>({rid:r.id,servings:state.settings.people})),checked:{},have:{},extras:state.plan.extras||[]});
  toast("Menu tiré au sort !");
}

/* ---- Recherche par ingrédients (frigo, mémorisé sur l'appareil) ---- */
let fridge=[];
try{fridge=JSON.parse(localStorage.getItem("courses:fridge")||"[]")}catch(e){fridge=[]}
const saveFridge=()=>{try{localStorage.setItem("courses:fridge",JSON.stringify(fridge))}catch(e){}};
const words=s=>norm(s).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>1&&!["de","du","la","le","les","des","en","au","aux","a"].includes(w)).map(w=>w.length>3&&/[sx]$/.test(w)?w.slice(0,-1):w);
function ingMatches(ingName,item){
  const a=words(ingName),b=words(item);
  return b.length>0&&b.every(w=>a.some(x=>x===w||(w.length>=4&&x.startsWith(w))));
}
function fridgeScore(r){
  const needed=(r.ingredients||[]).filter(i=>i.name&&i.aisle!=="Condiments & épices");
  const have=needed.filter(i=>fridge.some(f=>ingMatches(i.name,f)));
  return {have,needed,missing:needed.filter(i=>!have.includes(i))};
}
$("#fridge-form").onsubmit=e=>{
  e.preventDefault();
  const items=$("#fridge-in").value.split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  for(const it of items)if(!fridge.some(f=>norm(f)===norm(it)))fridge.push(it);
  $("#fridge-in").value="";saveFridge();renderRecipes();
};

let recFilter="",recCat="";
function renderRecipes(){
  const n=state.recipes.length;
  $("#rec-count").textContent=n?`${n} recette${n>1?"s":""}`:"";
  $("#fridge-chips").innerHTML=fridge.map((f,i)=>`<button class="chip on" data-fr="${i}">${esc(f)} ✕</button>`).join("")+(fridge.length>1?`<button class="chip" id="fr-clear">Tout effacer</button>`:"");
  $$("[data-fr]").forEach(b=>b.onclick=()=>{fridge.splice(+b.dataset.fr,1);saveFridge();renderRecipes()});
  const fc=$("#fr-clear");if(fc)fc.onclick=()=>{fridge=[];saveFridge();renderRecipes()};
  if(fridge.length){
    const ranked=state.recipes.map(r=>({r,s:fridgeScore(r)})).filter(x=>x.s.have.length)
      .sort((a,b)=>(b.s.have.length/b.s.needed.length)-(a.s.have.length/a.s.needed.length)||b.s.have.length-a.s.have.length);
    $("#rec-list").innerHTML=ranked.length?ranked.map(({r,s})=>`<div class="card rec" data-open="${esc(r.id)}"><div class="grow"><h3>${esc(r.name)}</h3>
      <div class="meta"><b style="color:var(--green)">${s.have.length}/${s.needed.length} ingrédients</b>${s.missing.length?` · manque : ${esc(s.missing.slice(0,5).map(i=>i.name).join(", "))}${s.missing.length>5?"…":""}`:" · tu as tout !"}</div></div>
      <svg viewBox="0 0 24 24" style="color:var(--muted)"><path d="m9 18 6-6-6-6"/></svg></div>`).join("")
      :`<div class="empty">Aucune recette n'utilise ces ingrédients</div>`;
    $$("[data-open]").forEach(c=>c.onclick=()=>openRecipe(c.dataset.open));
    $("#rec-cats").innerHTML="";
    return;
  }
  const cats=[...new Set(state.recipes.map(r=>r.category).filter(Boolean))].sort();
  $("#rec-cats").innerHTML=cats.length>1?cats.map(c=>`<button class="chip ${recCat===c?"on":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join(""):"";
  $$("[data-cat]").forEach(b=>b.onclick=()=>{recCat=recCat===b.dataset.cat?"":b.dataset.cat;renderRecipes()});
  const q=norm(recFilter);
  const list=state.recipes.filter(r=>(!recCat||r.category===recCat)&&(!q||norm(r.name).includes(q)||(r.ingredients||[]).some(i=>norm(i.name).includes(q)))).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  if(!n){$("#rec-list").innerHTML=`<div class="empty"><h3>Ton carnet est vide</h3></div>`;return}
  if(!list.length){$("#rec-list").innerHTML=`<div class="empty">Aucun résultat</div>`;return}
  const inPlan=new Set(state.plan.items.map(i=>i.rid));
  $("#rec-list").innerHTML=list.map(r=>`<div class="card rec" data-open="${esc(r.id)}"><div class="grow"><h3>${esc(r.name)}</h3><div class="meta">${r.category?`<span class="tag">${esc(r.category)}</span> · `:""}${r.servings||"?"} pers. · ${(r.ingredients||[]).length} ingrédients${inPlan.has(r.id)?" · <b style='color:var(--accent)'>au menu</b>":""}</div></div><svg viewBox="0 0 24 24" style="color:var(--muted)"><path d="m9 18 6-6-6-6"/></svg></div>`).join("");
  $$("[data-open]").forEach(c=>c.onclick=()=>openRecipe(c.dataset.open));
}
$("#rec-search").oninput=e=>{recFilter=e.target.value;renderRecipes()};

function renderList(){
  const all=buildList(), items=planRecipes();
  const checked=state.plan.checked||{},have=state.plan.have||{};
  const toBuy=all.filter(e=>!have[e.key]),atHome=all.filter(e=>have[e.key]);
  const done=toBuy.filter(e=>checked[e.key]).length,left=toBuy.length-done;
  const badge=$("#list-badge");badge.textContent=left;badge.classList.toggle("hidden",!left);
  $("#list-sub").textContent=all.length?`${done}/${toBuy.length} dans le panier · ${items.length} recette${items.length>1?"s":""}`:"";
  if(!all.length){
    $("#list-body").innerHTML=`<div class="empty"><h3>Liste vide</h3>Tire un menu au sort pour générer ta liste.<div style="margin-top:14px"><button class="btn" onclick="setTab('menu')">Aller au menu</button></div></div>${extraForm()}`;
    bindExtra();return;
  }
  let h=`<div class="progress"><i style="width:${toBuy.length?done/toBuy.length*100:0}%"></i></div>`;
  for(const a of AISLES){
    const g=toBuy.filter(e=>e.aisle===a).sort((x,y)=>(checked[x.key]?1:0)-(checked[y.key]?1:0)||x.name.localeCompare(y.name,"fr"));
    if(!g.length)continue;
    h+=`<div class="aisle"><h3>${esc(a)} <span class="count">${g.length}</span></h3><div class="card items" style="padding:0">`;
    for(const e of g)h+=`<div class="item ${checked[e.key]?"done":""}">
        <button class="chk" data-chk="${esc(e.key)}" aria-label="Cocher">${checked[e.key]?ICON_CHECK:""}</button>
        <div class="grow" data-chk="${esc(e.key)}" style="cursor:pointer"><div class="name">${esc(e.name)}</div><div class="qty">${esc(fmtQty(e))}</div></div>
        ${e.extra?`<button class="have" data-delx="${esc(e.extra)}">Suppr.</button>`:`<button class="have" data-have="${esc(e.key)}">J'ai</button>`}
      </div>`;
    h+=`</div></div>`;
  }
  h+=extraForm();
  if(atHome.length){
    h+=`<div class="aisle"><h3>Déjà à la maison <span class="count">${atHome.length}</span></h3><div class="card items" style="padding:0">`;
    for(const e of atHome)h+=`<div class="item done"><div class="grow"><div class="name">${esc(e.name)}</div><div class="qty">${esc(fmtQty(e))}</div></div><button class="have" data-unhave="${esc(e.key)}">Remettre</button></div>`;
    h+=`</div></div>`;
  }
  h+=`<div class="row" style="margin-top:18px;gap:8px"><button class="btn ghost small grow" id="uncheck">Tout décocher</button><button class="btn ghost small grow" id="clear-plan">Vider le menu</button></div>`;
  $("#list-body").innerHTML=h;
  $$("[data-chk]").forEach(b=>b.onclick=()=>{const k=b.dataset.chk;Store.patchPlanMap("checked",k,!checked[k])});
  $$("[data-have]").forEach(b=>b.onclick=()=>{Store.patchPlanMap("have",b.dataset.have,true);toast("Rangé dans « Déjà à la maison »")});
  $$("[data-unhave]").forEach(b=>b.onclick=()=>Store.patchPlanMap("have",b.dataset.unhave,false));
  $$("[data-delx]").forEach(b=>b.onclick=()=>{const p=clonePlan();p.extras=(p.extras||[]).filter(x=>x.id!==b.dataset.delx);Store.setPlan(p)});
  $("#uncheck").onclick=()=>{const p=clonePlan();p.checked={};Store.setPlan(p)};
  $("#clear-plan").onclick=()=>{
    if(!confirmClear){confirmClear=true;toast("Touche encore pour vider le menu et la liste");setTimeout(()=>confirmClear=false,3000);return}
    confirmClear=false;Store.setPlan({items:[],checked:{},have:{},extras:[]});
  };
  bindExtra();
}
function extraForm(){return `<div class="aisle"><h3>Ajouter un article</h3><form class="row" id="extra-form"><input type="text" id="extra-name" placeholder="Ex. : papier toilette" class="grow"><button class="btn small">Ajouter</button></form></div>`}
function bindExtra(){
  const f=$("#extra-form");if(!f)return;
  f.onsubmit=e=>{e.preventDefault();const v=$("#extra-name").value.trim();if(!v)return;
    const p=clonePlan();p.extras=[...(p.extras||[]),{id:uid(),name:v,aisle:guessAisle(v)}];Store.setPlan(p)};
}
$("#copy-list").onclick=async()=>{
  const all=buildList().filter(e=>!(state.plan.have||{})[e.key]);
  if(!all.length){toast("La liste est vide");return}
  let txt="Liste de courses\n";
  for(const a of AISLES){const g=all.filter(e=>e.aisle===a);if(!g.length)continue;txt+=`\n${a}\n`+g.map(e=>`- ${e.name}${fmtQty(e)?" : "+fmtQty(e):""}`).join("\n")+"\n"}
  try{
    if(navigator.share&&/Android|iPhone|iPad/i.test(navigator.userAgent)){await navigator.share({title:"Liste de courses",text:txt});return}
    await navigator.clipboard.writeText(txt);toast("Liste copiée");
  }catch(e){if(e&&e.name==="AbortError")return;openSheet(`<h2>Liste</h2><textarea style="min-height:300px">${esc(txt)}</textarea>`)}
};

function renderSettings(){
  $("#ppl").textContent=state.settings.people;
}
$$("[data-ppl]").forEach(b=>b.onclick=()=>Store.setSettings({people:Math.max(1,Math.min(20,state.settings.people+(+b.dataset.ppl)))}));

function renderAll(){
  renderBanner();renderMenu();renderRecipes();renderList();renderSettings();
}

/* ============ Feuilles ============ */
function openSheet(html){$("#sheet-body").innerHTML=html;$("#sheet-bg").style.display="block";requestAnimationFrame(()=>$("#sheet").classList.add("open"))}
function closeSheet(){$("#sheet").classList.remove("open");setTimeout(()=>{$("#sheet-bg").style.display="none";$("#sheet-body").innerHTML=""},250)}
$("#sheet-bg").onclick=closeSheet;

function openRecipe(id){
  const r=state.recipes.find(x=>x.id===id);if(!r)return;
  const inPlan=state.plan.items.some(i=>i.rid===id);
  openSheet(`<div class="row"><h2 class="grow">${esc(r.name)}</h2><button class="icon-btn" id="sh-close">${ICON_X}</button></div>
  <div class="sub">${r.category?`<span class="tag">${esc(r.category)}</span> · `:""}Pour ${r.servings||"?"} pers.${r.prepTime?` · ${esc(r.prepTime)} min`:""}</div>
  <h3 style="margin-top:16px">Ingrédients</h3>
  <div class="card" style="margin-top:6px;padding:6px 14px">${(r.ingredients||[]).map(i=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="grow">${esc(i.name)}</span><span class="sub">${i.qty!==null&&i.qty!==undefined&&i.qty!==""?esc(String(i.qty).replace(".",","))+" "+esc(i.unit||""):""}</span></div>`).join("")}</div>
  ${(r.steps||[]).length?`<h3 style="margin-top:16px">Préparation</h3><div class="steps-view"><ol>${r.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div>`:""}
  ${r.notes?`<div class="notes">${esc(r.notes)}</div>`:""}
  <button class="btn block" id="sh-plan" style="margin-top:18px" ${inPlan?"disabled":""}>${inPlan?"Déjà au menu":"Ajouter au menu"}</button>`);
  $("#sh-close").onclick=closeSheet;
  $("#sh-plan").onclick=()=>{const p=clonePlan();p.items.push({rid:id,servings:state.settings.people});Store.setPlan(p);closeSheet();toast("Ajoutée au menu")};
}
function openPicker(){
  const used=new Set(state.plan.items.map(i=>i.rid));
  const pool=state.recipes.filter(r=>!used.has(r.id)).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  openSheet(`<h2>Ajouter au menu</h2><div class="stack" style="margin-top:12px">${pool.map(r=>`<div class="card rec" data-pick="${esc(r.id)}"><div class="grow"><h3>${esc(r.name)}</h3></div><span style="color:var(--accent);font-weight:700">+</span></div>`).join("")||"<div class='empty'>Toutes tes recettes sont déjà au menu</div>"}</div>`);
  $$("[data-pick]").forEach(c=>c.onclick=()=>{const p=clonePlan();p.items.push({rid:c.dataset.pick,servings:state.settings.people});Store.setPlan(p);closeSheet()});
}

/* ============ Démarrage ============ */
setTab("menu");
renderAll();
loadRecipes();
