/* ============================================================
   comum.js — base compartilhada do menu (index.html) e dos jogos
   novos (5 e 6): estado, voz gravada, efeitos sonoros, confete.

   A voz são clipes em voz/vXXXX.m4a, mapeados em voz-pacote.js
   (window.VOZ[texto] = "vXXXX"). Português: a fala é quebrada em
   pedaços por pontuação e cada pedaço é um clipe. Inglês: a frase
   inteira é um clipe só, com a chave "en:" + frase.
   ============================================================ */
(function(raiz){
"use strict";

/* ---------- texto → pedaços (igual aos jogos 1 a 4) ---------- */
function humaniza(t){
  return String(t)
    .replace(/\b[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ]{2,}\b/g, m => m.charAt(0)+m.slice(1).toLowerCase())
    .replace(/\s+/g, " ").trim();
}
function pedacos(t){
  const bruto = []; let buf = "";
  for(const ch of t){ buf += ch; if(".!?…:;,".indexOf(ch) >= 0){ bruto.push(buf.trim()); buf = ""; } }
  if(buf.trim()) bruto.push(buf.trim());
  const j = [];
  for(const pe of bruto){
    if(j.length && j[j.length-1].length < 16) j[j.length-1] += " " + pe; else j.push(pe);
  }
  return j.length ? j : [t];
}
function partes(t, nome){
  t = humaniza(t);
  nome = (nome||"").trim();
  if(!nome || t.indexOf(nome) < 0) return pedacos(t);
  const saida = [];
  t.split(nome).forEach((frag,i)=>{
    if(i) saida.push(nome);
    frag = frag.trim().replace(/^[,;]\s*/,"");
    if(frag) pedacos(frag).forEach(c=>saida.push(c));
  });
  return saida.length ? saida : pedacos(t);
}

/* usado pela ferramenta que grava os clipes (node) */
if(typeof module !== "undefined" && module.exports){
  module.exports = {humaniza, pedacos, partes};
  if(typeof window === "undefined") return;
}

/* ---------- estado compartilhado ---------- */
const PADRAO = {nome:"Nina", vestido:"#FF5A6E", pele:"#F5C9A6", cabelo:"#3B2418", voz:true, prog:[0,0,0,0,0,0]};
let S = Object.assign({}, PADRAO);
try{
  const b = localStorage.getItem("vulcao-arcoiris");
  if(b) S = Object.assign({}, PADRAO, JSON.parse(b));
}catch(e){}
function le(chave, padrao){
  try{ const b = localStorage.getItem(chave); return b ? JSON.parse(b) : padrao; }catch(e){ return padrao; }
}
function grava(chave, valor){
  try{ localStorage.setItem(chave, JSON.stringify(valor)); return true; }catch(e){ return false; }
}

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const espera = ms => new Promise(r=>setTimeout(r,ms));
const sorteia = a => a[(Math.random()*a.length)|0];
function embaralha(a){
  a = a.slice();
  for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

/* ---------- efeitos sonoros (Web Audio) ---------- */
let AC = null;
function audio(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(AC.state === "suspended"){ try{ AC.resume(); }catch(e){} }
  return AC;
}
function nota(f, t0, dur, tipo, vol, f2){
  const ac = audio(); if(!ac) return;
  try{
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = tipo || "sine";
    o.frequency.setValueAtTime(f, ac.currentTime + t0);
    if(f2) o.frequency.exponentialRampToValueAtTime(f2, ac.currentTime + t0 + dur);
    g.gain.setValueAtTime(0.0001, ac.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol||.2, ac.currentTime + t0 + .02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + .05);
  }catch(e){}
}
const SFX = {
  toque(){ nota(660,0,.08,"triangle",.14); },
  pop(){ nota(520,0,.09,"sine",.2,980); },
  acerto(){ [523.25,659.25,783.99,1046.5].forEach((f,i)=>nota(f,i*.07,.3,"triangle",.18)); },
  tentar(){ nota(392,0,.14,"sine",.15); nota(330,.12,.22,"sine",.13); },
  estrela(){ nota(1046,0,.16,"triangle",.15,2093); },
  vira(){ nota(440,0,.06,"triangle",.1,620); },
  passo(){ nota(587,0,.1,"triangle",.14); nota(880,.08,.14,"triangle",.14); },
  fanfarra(){ [523,659,784,1046,784,1046,1318].forEach((f,i)=>nota(f,i*.11,.5,"triangle",.18)); }
};

/* ---------- voz gravada ---------- */
const faltas = [];                 /* textos sem clipe (para o teste acusar) */
const cache = new Map();           /* arquivo → Audio já carregando */
let tocando = null, falaId = 0;
let aoFalar = null;                /* gancho: Nina.aoFalar = txt => balão */

function chavePT(trecho){ return (window.VOZ && window.VOZ[trecho]) || null; }
function chaveEN(frase){ return (window.VOZ && window.VOZ["en:"+frase]) || null; }

function pega(arq){
  let a = cache.get(arq);
  if(!a){
    a = new Audio();
    a.preload = "auto";
    a.src = "voz/" + arq + ".m4a";
    cache.set(arq, a);
    /* tablet com pouca memória: guarda só os últimos clipes */
    if(cache.size > 14){
      const k = cache.keys().next().value, velho = cache.get(k);
      cache.delete(k);
      if(velho !== tocando){ try{ velho.removeAttribute("src"); velho.load(); }catch(e){} }
    }
  }
  return a;
}
/* deixa os clipes das próximas falas já baixando */
function prepara(lista, lingua){
  if(!S.voz) return;
  (Array.isArray(lista) ? lista : [lista]).forEach(t=>{
    if(!t) return;
    if(lingua === "en"){ const k = chaveEN(t); if(k) pega(k); }
    else partes(t, S.nome).forEach(p=>{ const k = chavePT(p); if(k) pega(k); });
  });
}
function tocaArquivo(arq, velocidade){
  return new Promise(res=>{
    paraClipe();                    /* antes de mexer nos ouvintes do mesmo clipe */
    const a = pega(arq);
    let pronto = false, teto = null;
    const fim = ()=>{
      if(pronto) return; pronto = true;
      clearTimeout(teto); a.onended = a.onerror = null;
      if(tocando === a) tocando = null;
      res();
    };
    a.onended = fim; a.onerror = fim;
    try{ a.currentTime = 0; }catch(e){}
    try{ a.playbackRate = velocidade || 1; }catch(e){}
    tocando = a;
    a._fim = fim;
    let pr; try{ pr = a.play(); }catch(e){ fim(); return; }
    if(pr && pr.catch) pr.catch(fim);
    teto = setTimeout(fim, 14000);
  });
}
function paraClipe(){
  const a = tocando;
  if(!a) return;
  tocando = null;
  try{ a.pause(); }catch(e){}
  if(a._fim) a._fim();
}

/* síntese do navegador: só quando falta o clipe */
function sintetiza(trecho, lingua){
  return new Promise(res=>{
    if(!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined"){
      return setTimeout(res, Math.min(1500, 250 + trecho.length*30));
    }
    let pronto = false;
    const fim = ()=>{ if(!pronto){ pronto = true; res(); } };
    try{
      const u = new SpeechSynthesisUtterance(trecho);
      u.lang = lingua === "en" ? "en-US" : "pt-BR";
      u.rate = lingua === "en" ? .82 : .9;
      u.onend = fim; u.onerror = fim;
      speechSynthesis.speak(u);
    }catch(e){ fim(); }
    setTimeout(fim, 900 + trecho.length*95);
  });
}
function anotaFalta(chave){ if(faltas.indexOf(chave) < 0) faltas.push(chave); }

async function tocaPartes(lista, meu, gap){
  for(let i=0;i<lista.length;i++){
    if(meu !== falaId) return false;
    const p = lista[i];
    if(p.arq) await tocaArquivo(p.arq, p.vel);
    else await sintetiza(p.txt, p.lingua);
    if(meu !== falaId) return false;
    if(i < lista.length-1) await espera(gap);
  }
  return true;
}
function partesPT(txt){
  return partes(txt, S.nome).map(p=>{
    const arq = chavePT(p);
    if(!arq) anotaFalta(p);
    return {arq, txt:p, lingua:"pt"};
  });
}
function parteEN(frase, devagar){
  const arq = chaveEN(frase);
  if(!arq) anotaFalta("en:"+frase);
  return {arq, txt:frase, lingua:"en", vel: devagar ? .8 : 1};
}

/* falar em português. Uma fala nova sempre interrompe a anterior.
   Devolve true se foi até o fim, false se foi interrompida. */
async function falar(txt, op){
  op = op || {};
  if(aoFalar && op.balao !== false) aoFalar(txt);
  const meu = ++falaId;
  paraClipe();
  try{ if("speechSynthesis" in window) speechSynthesis.cancel(); }catch(e){}
  if(!S.voz || !txt){ await espera(op.pausa === undefined ? 350 : op.pausa); return meu === falaId; }
  const ok = await tocaPartes(partesPT(txt), meu, op.gap === undefined ? 90 : op.gap);
  if(ok && op.pausa) await espera(op.pausa);
  return ok && meu === falaId;
}
/* falar em inglês: a frase inteira é um clipe */
async function falarEn(frase, op){
  op = op || {};
  const meu = ++falaId;
  paraClipe();
  try{ if("speechSynthesis" in window) speechSynthesis.cancel(); }catch(e){}
  if(!S.voz || !frase){ await espera(350); return meu === falaId; }
  const ok = await tocaPartes([parteEN(frase, op.devagar)], meu, 0);
  if(ok && op.pausa) await espera(op.pausa);
  return ok && meu === falaId;
}
/* sequência misturada: [["pt","Gato em inglês é"],["en","cat"]] */
async function conversa(itens, op){
  op = op || {};
  const meu = ++falaId;
  paraClipe();
  try{ if("speechSynthesis" in window) speechSynthesis.cancel(); }catch(e){}
  if(!S.voz){ await espera(350); return meu === falaId; }
  let lista = [];
  itens.forEach(it=>{
    if(it[0] === "en") lista.push(parteEN(it[1], it[2]));
    else lista = lista.concat(partesPT(it[1]));
  });
  const ok = await tocaPartes(lista, meu, op.gap === undefined ? 110 : op.gap);
  return ok && meu === falaId;
}
function calar(){
  falaId++; paraClipe();
  try{ if("speechSynthesis" in window) speechSynthesis.cancel(); }catch(e){}
}
function falando(){ return !!tocando; }

/* o primeiro toque destrava o áudio no celular */
let destravado = false;
function destrava(){
  if(destravado) return; destravado = true;
  audio();
  try{ const a = new Audio(); a.muted = true; const p = a.play(); if(p && p.catch) p.catch(()=>{}); }catch(e){}
}
document.addEventListener("pointerdown", destrava, true);
document.addEventListener("keydown", destrava, true);
document.addEventListener("visibilitychange", ()=>{ if(document.hidden) calar(); });

/* ---------- confete ---------- */
const CORES = ["#FF5A6E","#FF9A3D","#FFC93C","#3FCB8E","#3FA9F5","#9B6BF2"];
let cv = null, ctx = null, parts = [], animando = false;
function tela(){
  if(cv) return;
  cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:900";
  document.body.appendChild(cv);
  ctx = cv.getContext("2d");
  const ajusta = ()=>{
    const d = Math.min(window.devicePixelRatio||1, 2);
    cv.width = innerWidth*d; cv.height = innerHeight*d;
    ctx.setTransform(d,0,0,d,0,0);
  };
  addEventListener("resize", ajusta); ajusta();
}
function confete(n, x, y){
  tela();
  for(let i=0;i<n;i++){
    parts.push({
      x: x !== undefined ? x : Math.random()*innerWidth,
      y: y !== undefined ? y : -20 - Math.random()*innerHeight*.3,
      vx:(Math.random()-.5)*7, vy: y !== undefined ? -Math.random()*11-3 : Math.random()*2+1.5,
      r:Math.random()*Math.PI, vr:(Math.random()-.5)*.28,
      w:7+Math.random()*9, h:5+Math.random()*7, c:sorteia(CORES)
    });
  }
  if(parts.length > 260) parts = parts.slice(-260);
  if(!animando){ animando = true; requestAnimationFrame(laco); }
}
function laco(){
  ctx.clearRect(0,0,innerWidth,innerHeight);
  parts = parts.filter(p=>{
    p.vy += .19; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= .995;
    if(p.y > innerHeight+40) return false;
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r);
    ctx.fillStyle = p.c; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
    return true;
  });
  if(parts.length) requestAnimationFrame(laco);
  else { animando = false; ctx.clearRect(0,0,innerWidth,innerHeight); }
}

/* ---------- celular: nada de zoom, menu de contexto ou arrastar imagem ---------- */
addEventListener("contextmenu", e=>e.preventDefault());
addEventListener("dragstart", e=>e.preventDefault());
document.addEventListener("gesturestart", e=>e.preventDefault());

raiz.Nina = {
  S, le, grava, $, $$, espera, sorteia, embaralha,
  audio, nota, SFX, CORES,
  falar, falarEn, conversa, calar, falando, prepara, faltas,
  confete, humaniza, pedacos, partes,
  set aoFalar(f){ aoFalar = f; }, get aoFalar(){ return aoFalar; }
};
})(typeof window !== "undefined" ? window : globalThis);
