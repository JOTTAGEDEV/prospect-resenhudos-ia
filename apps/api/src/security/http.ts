import { lookup } from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import ipaddr from 'ipaddr.js';
import { AppError } from '../services/leads.js';

export function isPublicAddress(address:string) {
  try { const ip=ipaddr.process(address);return ip.range()==='unicast'; } catch { return false; }
}
export async function validateDestination(value:string) {
  let url:URL;
  try {url=new URL(value);} catch {throw new AppError(400,'URL inválida');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))) throw new AppError(400,'URL ou porta não permitida');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')&&!host.includes(':')) throw new AppError(400,'Destino interno bloqueado');
  const addresses=await lookup(host,{all:true});
  if(!addresses.length || addresses.some(a=>!isPublicAddress(a.address))) throw new AppError(400,'Destino não público bloqueado');
  return {url,address:addresses[0]};
}
export type HttpResult={status:number;text:string;url:string;contentType:string};
export async function safeGet(value:string,signal?:AbortSignal,redirects=0):Promise<HttpResult> {
  if(redirects>3) throw new AppError(400,'Limite de redirecionamentos atingido');
  const {url,address}=await validateDestination(value);
  // Pin the validated address to the socket, keeping hostname for Host/SNI/certificate verification.
  const result=await new Promise<HttpResult & {location?:string}>((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',signal,headers:{'User-Agent':'JotageProspectAI/0.1 (limited website audit)','Accept':'text/html,text/plain;q=0.9','Accept-Encoding':'identity'},lookup:(_hostname,_options,callback)=>callback(null,address.address,address.family)},res=>{
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){res.destroy();req.destroy(new AppError(422,'Página excede limite de 1 MB'));}else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode||0,text:Buffer.concat(chunks).toString('utf8'),url:url.href,contentType:res.headers['content-type']||'',location:res.headers.location}));
    });
    req.setTimeout(10000,()=>req.destroy(new Error('Tempo de resposta excedido')));
    req.on('error',reject);req.end();
  });
  if(result.status>=300&&result.status<400&&result.location) return safeGet(new URL(result.location,url).href,signal,redirects+1);
  return result;
}
