'use strict';
let tokenizerPromise;
function tokenizer(){if(!tokenizerPromise)tokenizerPromise=new Promise((resolve,reject)=>{try{if(!self.kuromoji)importScripts('https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js');self.kuromoji.builder({dicPath:'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'}).build((error,t)=>error?reject(error):resolve(t));}catch(e){reject(e);}}).catch(e=>{tokenizerPromise=null;throw e;});return tokenizerPromise;}
self.onmessage=async({data})=>{try{const t=await tokenizer();self.postMessage({id:data.id,tokens:data.texts.map(x=>t.tokenize(x).map(({surface_form,reading})=>({surface_form,reading})))});}catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}};
