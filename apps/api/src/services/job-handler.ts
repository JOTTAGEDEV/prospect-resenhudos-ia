import { and, eq, desc } from 'drizzle-orm';
import { searchInput } from '@jotage/shared';
import { type DB, stamp } from '../database/db.js';
import * as s from '../database/schema.js';
import { AppError, getLead, saveLead, scoreLead } from './leads.js';
import { getSettings } from './settings.js';
import type { Handler } from '../workers/queue.js';
import type { BusinessSearchProvider } from '../providers/overpass.js';
import type { WebsiteAuditService } from './audit.js';
import type { AIProvider } from '../providers/gemini.js';
import { digest } from '../security/crypto.js';
export function createHandler(db:DB,search:BusinessSearchProvider,auditor:WebsiteAuditService,ai:AIProvider):Handler {
  return async(job,signal,progress)=>{
    const ws=job.workspaceId;
    if(job.kind==='search') {
      const record=db.select().from(s.searches).where(and(eq(s.searches.id,job.targetId),eq(s.searches.workspaceId,ws))).get();
      if(!record)throw new AppError(404,'Pesquisa não encontrada');
      db.update(s.searches).set({status:'running'}).where(eq(s.searches.id,record.id)).run();progress(10);
      const found=await search.search(searchInput.parse(record.query),signal);signal.throwIfAborted();progress(65);
      let duplicates=0;
      db.transaction(tx=>{
        for(const item of found){signal.throwIfAborted();const saved=saveLead(tx,ws,item);if(saved.duplicate)duplicates++;tx.insert(s.results).values({...stamp(),workspaceId:ws,searchId:record.id,leadId:saved.lead.id}).onConflictDoNothing().run();}
        tx.update(s.searches).set({status:'completed',total:found.length,duplicates,updatedAt:new Date().toISOString()}).where(eq(s.searches.id,record.id)).run();
      });
      return {total:found.length,duplicates,saved:found.length-duplicates,attribution:'© OpenStreetMap contributors · ODbL'};
    }
    const lead=getLead(db,ws,job.targetId);
    if(job.kind==='audit') {
      const result=await auditor.audit(lead.website,signal);signal.throwIfAborted();
      db.insert(s.audits).values({...stamp(),workspaceId:ws,leadId:lead.id,data:result}).run();
      scoreLead(db,ws,lead.id,getSettings(db,ws).weights);return result;
    }
    if(job.kind==='analyze') {
      const audit=db.select().from(s.audits).where(and(eq(s.audits.workspaceId,ws),eq(s.audits.leadId,lead.id))).orderBy(desc(s.audits.createdAt)).get()?.data||null;
      const evidenceHash=digest(JSON.stringify({name:lead.name,category:lead.category,audit,settings:getSettings(db,ws)}));
      const cached=db.select().from(s.analyses).where(and(eq(s.analyses.workspaceId,ws),eq(s.analyses.leadId,lead.id),eq(s.analyses.evidenceHash,evidenceHash))).get();
      if(cached)return cached.data;
      const data=await ai.analyzeBusiness(ws,{name:lead.name,category:lead.category,audit},signal);signal.throwIfAborted();
      db.insert(s.analyses).values({...stamp(),workspaceId:ws,leadId:lead.id,data,evidenceHash}).run();return data;
    }
    throw new AppError(400,'Tipo de tarefa desconhecido');
  };
}
