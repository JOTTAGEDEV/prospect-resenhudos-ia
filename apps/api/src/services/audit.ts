import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import type { Audit } from '@jotage/shared';
import { safeGet, type HttpResult } from '../security/http.js';

export type WebsiteAuditService = {audit(url:string|null,signal?:AbortSignal):Promise<Audit>};
export function parsePage(page:HttpResult):Audit {
  const $=load(page.text), now=new Date().toISOString();
  const title=$('title').first().text().trim().slice(0,300),description=$('meta[name="description"]').attr('content')?.slice(0,500)||'';
  const links=$('a[href]').map((_i,e)=>$(e).attr('href')||'').get();
  const evidence=[{key:'http',value:String(page.status),sourceUrl:page.url,date:now},{key:'title',value:title||'Título não encontrado',sourceUrl:page.url,date:now},{key:'description',value:description||'Meta description não encontrada',sourceUrl:page.url,date:now}];
  return {status:page.status>=200&&page.status<300?'completed':'inaccessible',url:page.url,checkedAt:now,httpStatus:page.status,title,description,viewport:$('meta[name="viewport"]').length>0,headings:$('h1').length,contactLinks:links.filter(h=>/^(tel:|mailto:)|wa\.me|api\.whatsapp\.com/i.test(h)).length,forms:$('form').length,socialLinks:links.filter(h=>/^https?:\/\/(www\.)?(instagram\.com|facebook\.com|linkedin\.com)\//i.test(h)).slice(0,10),navigationLinks:$('nav a[href]').length,https:page.url.startsWith('https:'),evidence,limitations:['Apenas o HTML inicial de uma página foi verificado; scripts não foram executados.','Responsividade, performance, acessibilidade, CTA visual e links quebrados não foram testados.','Elementos ausentes no HTML podem existir após execução de JavaScript.']};
}
export class WebsiteAuditor implements WebsiteAuditService {
  constructor(private get:typeof safeGet=safeGet){}
  async audit(url:string|null,signal?:AbortSignal):Promise<Audit> {
    const base={url,checkedAt:new Date().toISOString(),evidence:[],limitations:[]};
    if(!url) return {...base,status:'not_informed',limitations:['Site não informado na fonte. Isso não comprova que a empresa não tenha site.']};
    try {
      const robotsUrl=new URL('/robots.txt',url).href;
      const robots=await this.get(robotsUrl,signal);
      if(robots.status===200 && robotsParser(robotsUrl,robots.text).isAllowed(url,'JotageProspectAI')===false) return {...base,status:'unavailable',limitations:['Acesso não permitido pelo robots.txt.']};
      if(robots.status!==200&&robots.status!==404&&robots.status!==410) return {...base,status:'unavailable',limitations:['Não foi possível verificar a política robots.txt.']};
      const page=await this.get(url,signal);
      // Re-check robots at the final origin after redirects.
      if(new URL(page.url).origin!==new URL(url).origin) {
        const redirectedRobots=await this.get(new URL('/robots.txt',page.url).href,signal);
        if(redirectedRobots.status===200&&robotsParser(new URL('/robots.txt',page.url).href,redirectedRobots.text).isAllowed(page.url,'JotageProspectAI')===false) return {...base,status:'unavailable',limitations:['Destino redirecionado não permite auditoria.']};
        if(![200,404,410].includes(redirectedRobots.status)) return {...base,status:'unavailable',limitations:['Política do destino redirecionado indisponível.']};
      }
      if(!page.contentType.includes('text/html')) return {...base,status:'partial',httpStatus:page.status,limitations:['Resposta não é HTML; conteúdo não analisado.']};
      return parsePage(page);
    } catch(error) {
      if(signal?.aborted) throw error;
      return {...base,status:'inaccessible',limitations:[error instanceof Error?error.message:'Falha na verificação limitada.']};
    }
  }
}
