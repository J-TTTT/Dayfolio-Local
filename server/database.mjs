import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('..',import.meta.url));
export const dataDir=path.resolve(process.env.DAYFOLIO_DATA_DIR||path.join(root,'data'));
fs.mkdirSync(dataDir,{recursive:true});
export const db=new DatabaseSync(path.join(dataDir,'dayfolio.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);');
for(const file of fs.readdirSync(path.join(root,'migrations')).filter(n=>n.endsWith('.sql')).sort()){
 if(db.prepare('SELECT name FROM local_migrations WHERE name=?').get(file))continue;
 db.exec('BEGIN IMMEDIATE');try{db.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));db.prepare('INSERT INTO local_migrations VALUES(?)').run(file);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
class Statement{
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 first(){return db.prepare(this.sql).get(...this.args)??null;}
 all(){return {results:db.prepare(this.sql).all(...this.args)};}
 run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}
}
export function database(){return {prepare:sql=>new Statement(sql),batch:statements=>{db.exec('BEGIN');try{const results=statements.map(s=>s.all());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};}
