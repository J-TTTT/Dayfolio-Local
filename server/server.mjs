import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {db,root} from './database.mjs';
import {context,currentUser,fail,email,passwordHash,passwordMatches,session,clearSession,accountInput,insertUser,hash} from './auth.mjs';
import * as entries from './entries.ts';
const port=Number(process.env.DAYFOLIO_PORT||4317);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid DAYFOLIO_PORT');
const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const counts=new Map();
function rateLimit(req){const key=req.socket.remoteAddress;const now=Date.now();let state=counts.get(key);if(!state||state.until<now){state={n:0,until:now+15*60000};counts.set(key,state);}if(++state.n>40)fail('尝试次数过多，请 15 分钟后重试',429);}
function requireOwner(user){if(user?.role!=='owner')fail('仅管理员可管理成员',403);}
async function route(request,raw){
 const url=new URL(request.url),method=request.method,user=currentUser(request),setupRequired=!db.prepare('SELECT id FROM users LIMIT 1').get();
 if(url.pathname==='/api/health'&&method==='GET')return json({app:'dayfolio-local',pid:process.pid});
 if(url.pathname==='/api/session'&&method==='GET')return json({user,setupRequired});
 if(url.pathname==='/api/session'&&method==='DELETE')return json({ok:true},200,{'Set-Cookie':clearSession(request)});
 if(url.pathname==='/api/setup'&&method==='POST'){
  rateLimit(raw);if(!setupRequired)fail('管理员已经创建，请登录',409);const p=await request.json();accountInput(p);const password=await passwordHash(p.password);
  db.exec('BEGIN IMMEDIATE');let owner;try{if(db.prepare('SELECT id FROM users LIMIT 1').get())fail('管理员已经创建，请登录',409);owner=insertUser(p,password,'owner');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return json({user:owner},201,{'Set-Cookie':session(owner.userId)});
 }
 if(url.pathname==='/api/login'&&method==='POST'){
  rateLimit(raw);const p=await request.json(),mail=email(p.email),u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(mail);
  // A fixed dummy hash keeps unknown-account checks on the same password path.
  const valid=await passwordMatches(p.password,u?.password??'00000000000000000000000000000000:'+ '0'.repeat(128));
  if(!u||!valid)fail('邮箱或密码不正确',401);return json({ok:true},200,{'Set-Cookie':session(u.id)});
 }
 if(url.pathname==='/api/register'&&method==='POST'){
  rateLimit(raw);const p=await request.json();const {mail}=accountInput(p);if(typeof p.token!=='string'||p.token.length!==64)fail('邀请码无效或已过期');const digest=hash(p.token);const password=await passwordHash(p.password);
  db.exec('BEGIN IMMEDIATE');let created;try{const invitation=db.prepare('SELECT * FROM invitations WHERE token_hash=? AND email=? AND expires>?').get(digest,mail,Date.now());if(!invitation)fail('邀请码无效、已过期，或邮箱不匹配');if(db.prepare('SELECT id FROM users WHERE email=?').get(mail))fail('该邮箱已有账号，请登录');created=insertUser(p,password,'member');db.prepare('DELETE FROM invitations WHERE id=?').run(invitation.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return json({ok:true},201,{'Set-Cookie':session(created.userId)});
 }
 if(!user)fail('请先登录',401);
 if(url.pathname==='/api/invitations'){
  requireOwner(user);
  if(method==='GET')return json({invitations:db.prepare('SELECT id,email,expires,created_at FROM invitations ORDER BY created_at DESC').all(),users:db.prepare('SELECT id,email,name,role,active FROM users ORDER BY created_at').all()});
  if(method==='POST'){const p=await request.json(),mail=email(p.email);if(db.prepare('SELECT id FROM users WHERE email=?').get(mail))fail('该邮箱已有本地账号');const token=randomBytes(32).toString('hex'),id=randomUUID();db.prepare('INSERT INTO invitations VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET id=excluded.id,token_hash=excluded.token_hash,expires=excluded.expires,created_at=excluded.created_at').run(id,mail,hash(token),Date.now()+7*86400000,new Date().toISOString());return json({email:mail,link:url.origin+'/#invite='+token+'&email='+encodeURIComponent(mail)},201);}
  if(method==='DELETE'){db.prepare('DELETE FROM invitations WHERE id=?').run(url.searchParams.get('id')??'');return json({ok:true});}
 }
 if(url.pathname==='/api/members'&&method==='PATCH'){requireOwner(user);const p=await request.json();if(typeof p.id!=='string'||typeof p.active!=='boolean')fail('成员信息不正确');db.exec('BEGIN');try{const result=db.prepare("UPDATE users SET active=? WHERE id=? AND role='member'").run(p.active?1:0,p.id);if(!result.changes)fail('成员不存在',404);if(!p.active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(p.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json({ok:true});}
 if(url.pathname==='/api/entries'){
  if(!['GET','POST','PATCH','DELETE'].includes(method))fail('不支持此操作',405);
  return context.run(user,()=>entries[method](request));
 }
 fail('接口不存在',404);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!hosts.has(req.headers.host)){res.writeHead(403);res.end('Invalid host');return;}
  const origin='http://'+req.headers.host,url=new URL(req.url,origin);if(url.origin!==origin)fail('请求来源不正确',403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if(url.pathname.startsWith('/api/')){
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)fail('请求来源不正确，请从本地网站操作',403);
   if(!['GET','HEAD','DELETE'].includes(req.method)&&!req.headers['content-type']?.startsWith('application/json'))fail('需要 JSON 格式',415);
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)fail('内容过大',413);chunks.push(chunk);}
   const body=Buffer.concat(chunks);const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}: {})});
   let response;try{response=await route(request,req);}catch(e){if(e instanceof SyntaxError)fail('请求内容格式不正确');throw e;}
   res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method))fail('不支持此操作',405);
  const relative=decodeURIComponent(url.pathname);const file=path.resolve(root,'dist','.'+relative),base=path.resolve(root,'dist');if(!file.startsWith(base+path.sep)&&file!==base)fail('文件不存在',404);
  const target=url.pathname==='/'?path.join(base,'index.html'):file;if(!fs.existsSync(target)||!fs.statSync(target).isFile())fail('文件不存在',404);
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
 }catch(e){const status=e.status||500;if(status===500)console.error(e);if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:status===500?'本地服务暂时不可用，请检查运行日志。':e.message}));}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,'127.0.0.1',()=>console.log(`Dayfolio Local ready: http://127.0.0.1:${port}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is already in use.`:e);process.exit(1);});
function stop(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
