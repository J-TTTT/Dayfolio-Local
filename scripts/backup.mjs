import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=path.join(root,'data','dayfolio.sqlite');
if(!fs.existsSync(source))throw new Error('No local database yet. Start Dayfolio first.');
const dir=path.join(root,'backups');fs.mkdirSync(dir,{recursive:true});
const target=path.join(dir,'dayfolio-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,target);console.log(target);}finally{db.close();}
