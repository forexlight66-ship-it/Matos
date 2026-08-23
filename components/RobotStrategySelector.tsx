'use client';
import {useEffect,useState} from 'react';
import AutoBotV2 from './AutoBotV2';
import IAHyper1 from './IAHyper1';
type Strategy='STANDARD'|'IA_HYPER1';
export default function RobotStrategySelector(){
 const[strategy,setStrategy]=useState<Strategy>('STANDARD');
 useEffect(()=>{
  const replaceLabels=()=>{
   const root=document.querySelector('.robot-strategy-selector');
   if(!root)return;
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   const nodes:Text[]=[];let node:Node|null;
   while((node=walker.nextNode()))nodes.push(node as Text);
   for(const text of nodes){
    if(text.nodeValue?.includes('Acima 4 / Abaixo 5'))text.nodeValue=text.nodeValue.replaceAll('Acima 4 / Abaixo 5','Acima 5 / Abaixo 4');
    if(text.nodeValue?.includes('ACIMA 4'))text.nodeValue=text.nodeValue.replaceAll('ACIMA 4','ACIMA 5');
    if(text.nodeValue?.includes('ABAIXO 5'))text.nodeValue=text.nodeValue.replaceAll('ABAIXO 5','ABAIXO 4');
   }
  };
  replaceLabels();
  const observer=new MutationObserver(replaceLabels);
  const root=document.querySelector('.robot-strategy-selector');
  if(root)observer.observe(root,{subtree:true,childList:true,characterData:true});
  return()=>observer.disconnect();
 },[strategy]);
 return <div className="robot-strategy-selector"><style>{`.robot-strategy-selector{padding:0 14px 10px}.robot-strategy-bar{display:grid;grid-template-columns:1fr;gap:5px;margin-bottom:8px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:var(--s1)}.robot-strategy-label{font-size:8px;font-weight:900;letter-spacing:.08em;color:var(--t3);text-transform:uppercase}.robot-strategy-select{width:100%;padding:10px 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:var(--s2);color:var(--t1);font-size:11px;font-weight:800;outline:none}.robot-strategy-select option{background:#121a2b;color:#fff}`}</style><div className="robot-strategy-bar"><div className="robot-strategy-label">Estratégia do Robô</div><select className="robot-strategy-select" value={strategy} onChange={e=>setStrategy(e.target.value as Strategy)}><option value="STANDARD">Estratégias padrão</option><option value="IA_HYPER1">IA Hper1</option></select></div>{strategy==='IA_HYPER1'?<IAHyper1/>:<AutoBotV2/>}</div>}
