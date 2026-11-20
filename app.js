import { extractItems, parseRecipeItems, parseRecipeText, itemsToText, cleanPastedText } from "./pdfimport.js";

/* ============ Constantes ============ */
const UNITS = ["","g","kg","ml","cl","l","pièce","c. à s.","c. à c.","pincée","gousse","tranche","botte","sachet","boîte","pot","paquet"];
const CATS = ["Viande","Poisson","Végé","Pâtes & riz","Soupe","Salade","Dessert","Autre"];
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
let repoRecipes=[];
function mergeRecipes(){
  const mine=Local.get("myrecipes",[]).filter(r=>r&&r.id&&r.name).map(r=>({...r,local:true}));
  state.recipes=[...repoRecipes,...mine];
}
async function loadRecipes(){
  try{
    const res=await fetch("recipes.json?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error(res.status);
    const data=await res.json();
    repoRecipes=(Array.isArray(data)?data:[]).filter(r=>r&&r.id&&r.name);
  }catch(e){state.recipesError=true}
  mergeRecipes();renderAll();
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
  $("#rec-list").innerHTML=list.map(r=>`<div class="card rec" data-open="${esc(r.id)}"><div class="grow"><h3>${esc(r.name)}</h3><div class="meta">${r.category?`<span class="tag">${esc(r.category)}</span> · `:""}${r.servings||"?"} pers. · ${(r.ingredients||[]).length} ingrédients${inPlan.has(r.id)?" · <b style='color:var(--accent)'>au menu</b>":""}${r.local?" · sur ce téléphone":""}</div></div><svg viewBox="0 0 24 24" style="color:var(--muted)"><path d="m9 18 6-6-6-6"/></svg></div>`).join("");
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
  <button class="btn block" id="sh-plan" style="margin-top:18px" ${inPlan?"disabled":""}>${inPlan?"Déjà au menu":"Ajouter au menu"}</button>
  ${r.local?`<div class="row" style="margin-top:8px;gap:8px"><button class="btn ghost grow" id="sh-edit">Modifier</button><button class="btn ghost grow" id="sh-del" style="color:var(--accent)">Supprimer</button></div>`:`<p class="sub" style="text-align:center;margin-top:10px">Recette du site : pour la modifier, demande à Claude.</p>`}`);
  $("#sh-close").onclick=closeSheet;
  if(r.local){
    $("#sh-edit").onclick=()=>openEditor(JSON.parse(JSON.stringify(r)));
    let armed=false;
    $("#sh-del").onclick=()=>{
      if(!armed){armed=true;$("#sh-del").textContent="Confirmer";return}
      Local.put("myrecipes",Local.get("myrecipes",[]).filter(x=>x.id!==id));mergeRecipes();
      const p=clonePlan();p.items=p.items.filter(i=>i.rid!==id);Store.setPlan(p);closeSheet();toast("Recette supprimée");
    };
  }
  $("#sh-plan").onclick=()=>{const p=clonePlan();p.items.push({rid:id,servings:state.settings.people});Store.setPlan(p);closeSheet();toast("Ajoutée au menu")};
}
function openPicker(){
  const used=new Set(state.plan.items.map(i=>i.rid));
  const pool=state.recipes.filter(r=>!used.has(r.id)).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  openSheet(`<h2>Ajouter au menu</h2><div class="stack" style="margin-top:12px">${pool.map(r=>`<div class="card rec" data-pick="${esc(r.id)}"><div class="grow"><h3>${esc(r.name)}</h3></div><span style="color:var(--accent);font-weight:700">+</span></div>`).join("")||"<div class='empty'>Toutes tes recettes sont déjà au menu</div>"}</div>`);
  $$("[data-pick]").forEach(c=>c.onclick=()=>{const p=clonePlan();p.items.push({rid:c.dataset.pick,servings:state.settings.people});Store.setPlan(p);closeSheet()});
}


/* ============ Ajout de recettes sur l'appareil ============ */
let edit=null;
const blankIng=()=>({name:"",qty:null,unit:"",aisle:""});
function openEditor(r){
  edit=r||{id:"local-"+uid(),name:"",servings:state.settings.people,category:"",prepTime:"",ingredients:[blankIng()],steps:[],notes:""};
  if(!edit.ingredients||!edit.ingredients.length)edit.ingredients=[blankIng()];
  const isNew=!state.recipes.some(x=>x.id===edit.id);
  openSheet(`<div class="row"><h2 class="grow">${isNew?"Nouvelle recette":"Modifier la recette"}</h2><button class="icon-btn" id="ed-close">${ICON_X}</button></div>
  ${edit._fromPdf?`<div class="banner" style="margin-top:10px">${edit._fromText?"Vérifie ce que j'ai compris du texte avant d'enregistrer : nom, quantités et rayons.":edit._fromPhoto?"Lecture d'une photo : vérifie bien les quantités et les noms, des erreurs sont possibles (ex. 209 g au lieu de 200 g).":"Vérifie ce que j'ai lu dans le PDF avant d'enregistrer, surtout les noms d'ingrédients et les rayons."}</div>`:""}
  <label class="f">Nom</label><input type="text" id="ed-name" value="${esc(edit.name)}" placeholder="Ex. : Curry de pois chiches">
  <div class="row" style="gap:10px">
    <div class="grow"><label class="f">Pour combien de personnes ?</label><input type="number" id="ed-serv" min="1" value="${esc(edit.servings||"")}"></div>
    <div class="grow"><label class="f">Temps total (min)</label><input type="number" id="ed-time" min="0" value="${esc(edit.prepTime||"")}"></div>
  </div>
  <label class="f">Catégorie</label>
  <div class="chips" id="ed-cats">${CATS.map(c=>`<button type="button" class="chip ${edit.category===c?"on":""}" data-ecat="${c}">${c}</button>`).join("")}</div>
  <label class="f">Ingrédients <span style="font-weight:400">(laisse la quantité vide pour « selon besoin »)</span></label>
  <div id="ed-ings"></div>
  <button class="btn ghost small" id="ed-add-ing">+ Ingrédient</button>
  <label class="f">Étapes (une par ligne, facultatif)</label>
  <textarea id="ed-steps">${esc((edit.steps||[]).join("\n"))}</textarea>
  <label class="f">Notes (facultatif)</label>
  <textarea id="ed-notes" style="min-height:60px">${esc(edit.notes||"")}</textarea>
  <button class="btn block" id="ed-save" style="margin-top:16px">Enregistrer</button>`);
  renderIngs();
  $("#ed-close").onclick=closeSheet;
  $$("[data-ecat]").forEach(b=>b.onclick=()=>{edit.category=edit.category===b.dataset.ecat?"":b.dataset.ecat;$$("[data-ecat]").forEach(x=>x.classList.toggle("on",x.dataset.ecat===edit.category))});
  $("#ed-add-ing").onclick=()=>{syncIngs();edit.ingredients.push(blankIng());renderIngs();const all=$$(".ing-name");all[all.length-1].focus()};
  $("#ed-save").onclick=saveEditor;
}
function renderIngs(){
  $("#ed-ings").innerHTML=edit.ingredients.map((i,k)=>`<div class="ing-block"><div class="ing">
    <input type="text" class="ing-name" data-k="${k}" placeholder="Ingrédient" value="${esc(i.name)}">
    <input type="number" class="ing-qty" step="any" min="0" placeholder="Qté" value="${i.qty===null||i.qty===undefined?"":esc(i.qty)}">
    <select class="ing-unit">${UNITS.map(u=>`<option value="${esc(u)}" ${u===(i.unit||"")?"selected":""}>${u||"—"}</option>`).join("")}</select>
    <button class="icon-btn" data-delk="${k}" title="Retirer">${ICON_X}</button>
    <select class="aisle-sel" data-k="${k}">${AISLES.map(a=>`<option ${a===(i.aisle||guessAisle(i.name))?"selected":""}>${esc(a)}</option>`).join("")}</select>
  </div></div>`).join("");
  $$(".ing-name").forEach(inp=>inp.addEventListener("change",()=>{
    const k=+inp.dataset.k;if(edit.ingredients[k]&&edit.ingredients[k].aisleManual)return;
    $(`.aisle-sel[data-k="${k}"]`).value=guessAisle(inp.value)}));
  $$(".aisle-sel").forEach(s=>s.addEventListener("change",()=>{edit.ingredients[+s.dataset.k].aisleManual=true}));
  $$("[data-delk]").forEach(b=>b.onclick=()=>{syncIngs();edit.ingredients.splice(+b.dataset.delk,1);if(!edit.ingredients.length)edit.ingredients.push(blankIng());renderIngs()});
}
function syncIngs(){
  edit.ingredients=[...$$("#ed-ings .ing")].map((b,k)=>{const q=b.querySelector(".ing-qty").value;return{
    name:b.querySelector(".ing-name").value.trim(),qty:q===""?null:Number(q),unit:b.querySelector(".ing-unit").value,
    aisle:b.querySelector(".aisle-sel").value,aisleManual:edit.ingredients[k]&&edit.ingredients[k].aisleManual}});
}
function saveEditor(){
  syncIngs();
  const name=$("#ed-name").value.trim();
  if(!name){toast("Donne un nom à la recette");$("#ed-name").focus();return}
  const ings=edit.ingredients.filter(i=>i.name).map(({name,qty,unit,aisle})=>({name,qty:qty===null||isNaN(qty)?null:qty,unit,aisle}));
  if(!ings.length){toast("Ajoute au moins un ingrédient");return}
  const r={id:edit.id,name,servings:Math.max(1,parseInt($("#ed-serv").value)||state.settings.people),
    category:edit.category||"",prepTime:parseInt($("#ed-time").value)||null,ingredients:ings,
    steps:$("#ed-steps").value.split("\n").map(s=>s.trim()).filter(Boolean),notes:$("#ed-notes").value.trim()};
  const mine=Local.get("myrecipes",[]);const i=mine.findIndex(x=>x.id===r.id);
  if(i>=0)mine[i]=r;else mine.push(r);
  if(!Local.put("myrecipes",mine))return;
  mergeRecipes();renderAll();closeSheet();toast("Recette enregistrée");
}

let pdfjsLib=null, tesseractP=null;
async function getPdfjs(){
  if(!pdfjsLib){pdfjsLib=await import("./lib/pdf.min.mjs");pdfjsLib.GlobalWorkerOptions.workerSrc=new URL("./lib/pdf.worker.min.mjs",location.href).href}
  return pdfjsLib;
}
function getTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!tesseractP)tesseractP=new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload=()=>res(window.Tesseract);s.onerror=()=>{tesseractP=null;rej(new Error("tesseract"))};
    document.head.appendChild(s);
  });
  return tesseractP;
}
function setStatus(t){const el=$("#imp-status");if(el)el.textContent=t}
async function shrinkImage(file,max=2200){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c;
  }finally{URL.revokeObjectURL(url)}
}
async function ocr(canvas){
  setStatus("Chargement de la lecture de texte (la première fois, ça peut prendre une minute)…");
  const T=await getTesseract();
  const {data}=await T.recognize(canvas,"fra",{logger:m=>{if(m.status==="recognizing text")setStatus(`Lecture du texte… ${Math.round(m.progress*100)} %`)}});
  return data.text||"";
}
async function pdfToCanvas(pdfjs,data){
  const doc=await pdfjs.getDocument({data,isEvalSupported:false}).promise;
  const page=await doc.getPage(1);const vp=page.getViewport({scale:2});
  const c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;
  await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;return c;
}
async function importFile(file){
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  const isImg=/^image\//.test(file.type)||/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
  openSheet(`<h2>Lecture de la recette…</h2><div class="row" style="margin-top:14px;align-items:flex-start"><div class="spinner" style="color:var(--accent);flex:none"></div><span class="sub" id="imp-status">${esc(file.name||"")}</span></div>`);
  let parsed=null,fromPhoto=false;
  try{
    if(isPdf){
      setStatus("Lecture du PDF…");
      const pdfjs=await getPdfjs();
      const data=new Uint8Array(await file.arrayBuffer());
      const pages=await extractItems(pdfjs,data.slice());
      if(pages.flat().length){
        parsed=parseRecipeItems(pages);
        if(!parsed.ingredients.length){const alt=parseRecipeText(itemsToText(pages));if(alt.ingredients.length)parsed=alt}
      }else{fromPhoto=true;parsed=parseRecipeText(await ocr(await pdfToCanvas(pdfjs,data)))}
    }else if(isImg){
      fromPhoto=true;setStatus("Préparation de la photo…");
      parsed=parseRecipeText(await ocr(await shrinkImage(file)));
    }else throw new Error("format");
    if(!parsed||(!parsed.name&&!parsed.ingredients.length))throw new Error("rien");
    parsed.ingredients=parsed.ingredients.map(i=>({...i,aisle:guessAisle(i.name)}));
    if(!parsed.ingredients.length)toast("Ingrédients non trouvés : ajoute-les à la main");
    openEditor({id:"local-"+uid(),category:"",...parsed,_fromPdf:true,_fromPhoto:fromPhoto});
  }catch(e){
    console.error(e);
    const msg=e&&e.message==="tesseract"?"Je n'ai pas pu charger la lecture de photos : vérifie ta connexion internet et réessaie."
      :e&&e.message==="format"?"Ce type de fichier n'est pas pris en charge : choisis une photo ou un PDF."
      :e&&e.name==="EncodingError"||/heic/i.test(file.name||"")?"Je n'arrive pas à ouvrir cette photo. Réessaie en prenant la photo directement depuis le bouton."
      :"Je n'ai pas trouvé de recette lisible dans ce fichier.";
    openSheet(`<h2>Import impossible</h2><p class="sub">${msg} Tu peux aussi saisir la recette à la main.</p><button class="btn block" id="pdf-manual" style="margin-top:12px">Saisir à la main</button>`);
    $("#pdf-manual").onclick=()=>openEditor();
  }
}
$("#pdf-input").onchange=e=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(f)importFile(f)};
$("#add-form").onclick=()=>openEditor();
$("#add-text").onclick=()=>{
  const canRead=!!(navigator.clipboard&&navigator.clipboard.readText);
  openSheet(`<div class="row"><h2 class="grow">Coller un texte</h2><button class="icon-btn" id="tx-close">${ICON_X}</button></div>
  <p class="sub">Légende Instagram ou TikTok, recette copiée d'un site, d'un message… Sur Instagram : appuie longuement sur la légende (ou « … » puis « Copier »).</p>
  ${canRead?`<button class="btn ghost block" id="tx-paste" style="margin-top:6px">Coller ce que j'ai copié</button>`:""}
  <textarea id="tx-text" style="min-height:220px;margin-top:10px" placeholder="Colle le texte de la recette ici…"></textarea>
  <button class="btn block" id="tx-go" style="margin-top:12px">Lire la recette</button>`);
  $("#tx-close").onclick=closeSheet;
  const tp=$("#tx-paste");
  if(tp)tp.onclick=async()=>{try{const t=await navigator.clipboard.readText();if(t){$("#tx-text").value=t}else toast("Rien à coller")}catch(e){toast("Appuie longuement dans la zone de texte puis « Coller »");$("#tx-text").focus()}};
  $("#tx-go").onclick=()=>{
    const t=$("#tx-text").value.trim();
    if(t.length<15){toast("Colle le texte complet de la recette");return}
    const parsed=parseRecipeText(cleanPastedText(t));
    if(!parsed.ingredients.length&&!parsed.steps.length){toast("Je n'ai pas trouvé de recette dans ce texte");return}
    parsed.ingredients=parsed.ingredients.map(i=>({...i,aisle:guessAisle(i.name)}));
    if(!parsed.ingredients.length)toast("Ingrédients non trouvés : ajoute-les à la main");
    openEditor({id:"local-"+uid(),category:"",...parsed,_fromPdf:true,_fromText:true});
  };
};
$("#export-mine").onclick=async()=>{
  const mine=Local.get("myrecipes",[]);
  if(!mine.length){toast("Aucune recette ajoutée sur ce téléphone");return}
  const txt=JSON.stringify(mine,null,2);
  try{await navigator.clipboard.writeText(txt);toast(`${mine.length} recette${mine.length>1?"s":""} copiée${mine.length>1?"s":""}`)}
  catch(e){openSheet(`<h2>Mes recettes</h2><p class="sub">Sélectionne et copie le texte :</p><textarea style="min-height:300px">${esc(txt)}</textarea>`)}
};

/* ============ Démarrage ============ */
setTab("menu");
renderAll();
loadRecipes();
