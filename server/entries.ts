import {getChatGPTUser} from './auth.mjs';
import {database} from './database.mjs';
import {today,validDate,validateEntry,ideaTypeOf,categories,ideaTypes,type Entry} from '../lib/journal.ts';
export const dynamic='force-dynamic';
const fields='id,kind,date,time,title,body,category,done,completed_date AS completedDate,created_at AS createdAt,updated_at AS updatedAt,project_name AS projectName,idea_type AS ideaType,progress,problems,solution,next_steps AS nextSteps';
function mapRow(e:Entry){return {...e,done:!!e.done,ideaType:e.kind==='idea'?ideaTypeOf(e):''};}
function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});}
async function user(){return (await getChatGPTUser())?.userId;}
function failure(error:unknown){console.error('Journal database request failed',error);return response({error:'本地暂时不可用，请稍后重试。你的输入仍保留在页面中。'},503);}
function sameOrigin(request:Request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin;}
export async function GET(request:Request){
 const userId=await user();if(!userId)return response({error:'请先登录以查看你的记录。'},401);
 const url=new URL(request.url),from=url.searchParams.get('from'),to=url.searchParams.get('to');
 if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return response({error:'日期范围不正确'},400);
 const offset=Number(url.searchParams.get('ideaOffset')??0);if(!Number.isSafeInteger(offset)||offset<0)return response({error:'分页参数不正确'},400);
 const category=url.searchParams.get('ideaCategory')??'',ideaType=url.searchParams.get('ideaType')??'';
 if((category&&!categories.includes(category as typeof categories[number]))||(ideaType&&!ideaTypes.includes(ideaType as typeof ideaTypes[number])))return response({error:'灵感分类不正确'},400);
 try{const db=database();const [records,ideas,archive,projects]=await db.batch([
 db.prepare(`SELECT ${fields} FROM entries WHERE user_id=? AND ((date BETWEEN ? AND ?) OR (completed_date BETWEEN ? AND ?)) ORDER BY date,time,created_at`).bind(userId,from,to,from,to),
 db.prepare(`SELECT ${fields} FROM entries WHERE user_id=? AND kind='idea' AND (?='' OR category=?) ORDER BY date DESC,created_at DESC`).bind(userId,category,category),
 db.prepare('SELECT date FROM (SELECT date FROM entries WHERE user_id=? UNION SELECT completed_date AS date FROM entries WHERE user_id=? AND completed_date IS NOT NULL) ORDER BY date DESC LIMIT 90').bind(userId,userId),
 db.prepare("SELECT DISTINCT project_name AS name FROM entries WHERE user_id=? AND project_name<>'' ORDER BY project_name LIMIT 300").bind(userId)
 ]);const filtered=(ideas.results as Entry[]).map(mapRow).filter(e=>!ideaType||e.ideaType===ideaType);return response({entries:(records.results as Entry[]).map(mapRow),ideas:filtered.slice(offset,offset+60),dates:(archive.results as {date:string}[]).map(r=>r.date),ideaCount:filtered.length,projects:(projects.results as {name:string}[]).map(p=>p.name)});}catch(e){return failure(e);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return response({error:'请求来源不正确'},403);
 const userId=await user();if(!userId)return response({error:'请先登录再保存记录。'},401);
 let p;try{p=validateEntry(await request.json());}catch(e){return response({error:e instanceof Error?e.message:'记录格式不正确'},400);}
 const date=p.date;const now=new Date().toISOString();const e={...p,id:crypto.randomUUID(),completedDate:p.done?date:null,createdAt:now,updatedAt:now};
 try{await database().prepare('INSERT INTO entries (id,user_id,kind,date,time,title,body,category,done,completed_date,created_at,updated_at,project_name,idea_type,progress,problems,solution,next_steps) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(e.id,userId,e.kind,e.date,e.time,e.title,e.body,e.category,e.done?1:0,e.completedDate,now,now,e.projectName,e.ideaType,e.progress,e.problems,e.solution,e.nextSteps).run();return response({entry:e},201);}catch(error){return failure(error);}
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return response({error:'请求来源不正确'},403);
 const userId=await user();if(!userId)return response({error:'请先登录再修改记录。'},401);
 let p:Record<string,unknown>;try{p=await request.json();if(!p||typeof p.id!=='string')throw new Error();}catch{return response({error:'记录格式不正确'},400);}
 try{const db=database();const old=await db.prepare(`SELECT ${fields} FROM entries WHERE id=? AND user_id=?`).bind(p.id,userId).first() as Entry|null;if(!old)return response({error:'记录不存在'},404);
 const changes={...p};if(p.done===false&&p.progress===undefined&&old.progress===100)changes.progress=null;if(typeof p.progress==='number'&&p.done===undefined)changes.done=p.progress===100;
 let input;try{input=validateEntry({...old,done:!!old.done,...changes});}catch(e){return response({error:e instanceof Error?e.message:'记录格式不正确'},400);}
 const complete=input.done?(old.done?(input.kind==='work'?input.date:old.completedDate):today()):null;
 const e={...old,...input,completedDate:complete,updatedAt:new Date().toISOString()};
 await db.prepare('UPDATE entries SET kind=?,date=?,time=?,title=?,body=?,category=?,done=?,completed_date=?,updated_at=?,project_name=?,idea_type=?,progress=?,problems=?,solution=?,next_steps=? WHERE id=? AND user_id=?').bind(e.kind,e.date,e.time,e.title,e.body,e.category,e.done?1:0,e.completedDate,e.updatedAt,e.projectName,e.ideaType,e.progress,e.problems,e.solution,e.nextSteps,e.id,userId).run();return response({entry:e});}catch(error){return failure(error);}
}
export async function DELETE(request:Request){
 if(!sameOrigin(request))return response({error:'请求来源不正确'},403);const userId=await user();if(!userId)return response({error:'请先登录'},401);
 const id=new URL(request.url).searchParams.get('id');if(!id)return response({error:'记录不存在'},400);
 try{const result=await database().prepare('DELETE FROM entries WHERE id=? AND user_id=?').bind(id,userId).run();if(!result.meta.changes)return response({error:'记录不存在'},404);return response({ok:true});}catch(error){return failure(error);}
}

