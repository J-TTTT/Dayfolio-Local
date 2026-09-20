import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {db} from './database.mjs';
const scrypt=promisify(scryptCallback);
export const context=new AsyncLocalStorage();
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function getChatGPTUser(){return context.getStore()??null;}
export function currentUser(request){const token=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dayfolio_session='))?.slice(17);if(!token)return null;return db.prepare('SELECT u.id AS userId,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(hash(token),Date.now())??null;}
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function email(value){if(typeof value!=='string'||value.length>254||!/^\S+@\S+\.\S+$/.test(value))fail('请填写有效邮箱');return value.trim().toLowerCase();}
export async function passwordHash(password){if(typeof password!=='string'||password.length<12||password.length>128)fail('密码需为 12–128 个字符');const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return salt+':'+key.toString('hex');}
export async function passwordMatches(password,stored){if(typeof password!=='string'||password.length>128)return false;const [salt,key]=stored.split(':');const candidate=await scrypt(password,salt,64);return timingSafeEqual(Buffer.from(key,'hex'),candidate);}
export function session(userId){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),userId,Date.now()+7*86400000);return `dayfolio_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`;}
export function clearSession(request){const token=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dayfolio_session='))?.slice(17);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));return 'dayfolio_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';}
export function accountInput(p){if(!p||typeof p!=='object')fail('账号信息格式不正确');const mail=email(p.email);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80)fail('请填写称呼，最多 80 个字');return {mail,name:p.name.trim()};}
export function insertUser(p,password,role){const {mail,name}=accountInput(p);const id=randomUUID();db.prepare('INSERT INTO users(id,email,name,password,role,created_at) VALUES(?,?,?,?,?,?)').run(id,mail,name,password,role,new Date().toISOString());return {userId:id,email:mail,name,role};}
