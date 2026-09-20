export const categories = ['工作项目','科研进展','学习成长','生活日常','产品创意','其他'] as const;
export const kinds = {plan:'计划',event:'日程',work:'工作记录',idea:'灵感',research:'科研'} as const;
export const ideaTypes = ['灵感火花','问题与解决方案','工作／科研思路','待验证假设','资料与方法'] as const;
export type IdeaType = typeof ideaTypes[number];
export type Kind = keyof typeof kinds;
export type Entry = {id:string;kind:Kind;date:string;time:string;title:string;body:string;category:string;done:boolean;completedDate:string|null;createdAt:string;updatedAt:string;projectName:string;ideaType:IdeaType|'';progress:number|null;problems:string;solution:string;nextSteps:string};
export function classifyIdea(text:string):IdeaType{
 if(/报错|bug|问题|故障|解决|踩坑|排查/i.test(text))return '问题与解决方案';
 if(/假设|待验证|猜想|是否能|能否|如果.*那么/i.test(text))return '待验证假设';
 if(/资料|文献|教程|工具|参考|方法笔记|链接|https?:/i.test(text))return '资料与方法';
 if(/思路|路线|方案|实验设计|研究设计|实现路径|计划如何/i.test(text))return '工作／科研思路';
 return '灵感火花';
}
export function ideaTypeOf(e:Pick<Entry,'ideaType'|'title'|'body'>){return e.ideaType||classifyIdea(e.title+' '+e.body);}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function shift(date:string,days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function monday(date:string){const n=new Date(date+'T12:00:00Z').getUTCDay();return shift(date,-((n+6)%7));}
export function validDate(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2100-12-31'&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function classify(text:string){
 if(/科研|实验|课题|文献综述|数据分析|投稿|审稿|消融|基线模型/i.test(text))return '科研进展';
 const rules:[string,RegExp][]=[['学习成长',/学习|阅读|读书|课程|论文|研究|练习|笔记|英语|读完|复习|知识|学习计划/i],['生活日常',/运动|跑步|健身|家人|朋友|购物|旅行|做饭|休息|睡眠|医院|散步|生活/i],['产品创意',/产品|创意|想法|灵感|idea|用户体验|设计|原型|功能|工具|网站|app|自动化/i],['工作项目',/工作|会议|项目|客户|开发|代码|测试|汇报|文档|需求|上线|任务|报告|沟通|方案|bug/i]];
 return rules.find(([,pattern])=>pattern.test(text))?.[0]??'其他';
}
export function validateEntry(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('记录格式不正确');
 const p=input as Record<string,unknown>;
 if(typeof p.kind!=='string'||!Object.hasOwn(kinds,p.kind))throw new Error('请选择记录类型');
 if(!validDate(p.date))throw new Error('请选择有效日期（2000–2100 年）');
 if(typeof p.title!=='string'||!p.title.trim()||p.title.trim().length>300)throw new Error('标题需要 1–300 个字');
 if(p.body!==undefined&&(typeof p.body!=='string'||p.body.length>10000))throw new Error('补充内容最多 10000 个字');
 if(p.time!==undefined&&(typeof p.time!=='string'||(p.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))))throw new Error('请选择有效时间');
 if(p.category!==undefined&&p.category!=='自动分类'&&!categories.includes(p.category as typeof categories[number]))throw new Error('请选择有效分类');
 if(p.done!==undefined&&typeof p.done!=='boolean')throw new Error('完成状态不正确');
 for(const [key,label,limit] of [['projectName','项目名称',120],['problems','遇到的问题',10000],['solution','解决方案',10000],['nextSteps','下一步',10000]] as const){if(p[key]!==undefined&&(typeof p[key]!=='string'||(p[key] as string).length>limit))throw new Error(`${label}最多 ${limit} 个字`);}
 if(p.ideaType!==undefined&&p.ideaType!==''&&p.ideaType!=='自动分类'&&!ideaTypes.includes(p.ideaType as IdeaType))throw new Error('请选择有效的灵感分类');
 if(p.progress!==undefined&&p.progress!==null&&(typeof p.progress!=='number'||!Number.isInteger(p.progress)||p.progress<0||p.progress>100))throw new Error('进度需要是 0–100 的整数');
 const kind=p.kind as Kind,title=p.title.trim(),body=(p.body as string??'').trim();
 const done=kind!=='idea'&&(p.progress===100||p.done===true||(kind==='work'&&p.done===undefined&&p.progress==null));
 return {kind,date:p.date,time:p.time as string??'',title,body,category:!p.category||p.category==='自动分类'?(kind==='research'?'科研进展':classify(title+' '+body)):p.category as string,done,projectName:(p.projectName as string??'').trim().replace(/\s+/g,' '),ideaType:kind==='idea'?(!p.ideaType||p.ideaType==='自动分类'?classifyIdea(title+' '+body):p.ideaType as IdeaType):'' as const,progress:kind==='idea'?null:done?100:(p.progress as number|null??null),problems:(p.problems as string??'').trim(),solution:(p.solution as string??'').trim(),nextSteps:(p.nextSteps as string??'').trim()};
}
export function makeReport(entries:Entry[],from:string,to:string){
 const inRange=(d:string|null)=>!!d&&d>=from&&d<=to;
 const planned=entries.filter(e=>e.kind!=='idea'&&e.kind!=='work'&&inRange(e.date));
 const completed=entries.filter(e=>e.kind!=='idea'&&e.done&&inRange(e.completedDate));
 const pending=entries.filter(e=>e.kind!=='idea'&&!e.done&&inRange(e.date));
 const ideas=entries.filter(e=>e.kind==='idea'&&inRange(e.date));
 const relevant=entries.filter(e=>inRange(e.date)||inRange(e.completedDate));
 const research=relevant.filter(e=>e.kind==='research');
 const ideaGroups=ideaTypes.map(name=>({name,entries:ideas.filter(e=>ideaTypeOf(e)===name)})).filter(g=>g.entries.length);
 const projects=[...new Set(relevant.map(e=>e.projectName?.trim()||''))].sort((a,b)=>a?b?a.localeCompare(b,'zh-CN'):-1:1).map(name=>({name:name||'未关联项目',entries:relevant.filter(e=>(e.projectName?.trim()||'')===name).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt))}));
 const groups=categories.map(name=>({name,entries:relevant.filter(e=>e.category===name)})).filter(g=>g.entries.length);
 const rate=planned.length?Math.round(planned.filter(e=>e.done).length/planned.length*100):0;
 const topics=groups.slice().sort((a,b)=>b.entries.length-a.entries.length).slice(0,2).map(g=>g.name).join('、');
 const overview=relevant.length?`这${from===to?'一天':'一周'}完成 ${completed.length} 项工作，记录 ${ideas.length} 条灵感；安排了 ${planned.length} 项日程与计划，当前还有 ${pending.length} 项待推进。${topics?'记录主要集中在'+topics+'。':''}`:'这段时间还没有记录。添加日程、工作或灵感后，汇总会自动出现在这里。';
 return {from,to,planned,completed,pending,ideas,research,groups,ideaGroups,projects,rate,overview,total:relevant.length};
}
export type Report=ReturnType<typeof makeReport>;
export function entryDetails(e:Entry){return [['内容',e.body],['遇到的问题',e.problems],['解决方案',e.solution],['下一步',e.nextSteps]].filter(([,text])=>!!text);}
function entryText(e:Entry){return [`#### ${e.title}`,`${e.date} · ${kinds[e.kind]} · ${e.kind==='idea'?ideaTypeOf(e):e.done?'已完成':'待推进'}${e.kind!=='idea'&&e.progress!=null?' · 事项进度 '+e.progress+'%':''}`, ...entryDetails(e).map(([label,value])=>`**${label}**\n\n${value}`)].join('\n\n');}
export function reportText(r:Report){return [`# ${r.from===r.to?'日报':'周报'} · ${r.from}${r.from===r.to?'':' — '+r.to}`,r.overview,'## 按项目汇总',...r.projects.flatMap(g=>['### '+g.name,...g.entries.map(entryText)]),'## 已完成工作',...r.completed.map(e=>'- '+e.title+(e.projectName?' · '+e.projectName:'')),'## 待推进',...r.pending.map(e=>'- '+e.title+'（'+e.date+'）'+(e.nextSteps?'；下一步：'+e.nextSteps:'')),'## 灵感分类',...r.ideaGroups.flatMap(g=>['### '+g.name,...g.entries.map(e=>'- '+e.title+(e.body?'：'+e.body:''))]),...(r.research.length?['## 科研进展',...r.research.map(e=>'- '+e.title+(e.body?'：'+e.body:'')+'（'+(e.done?'已完成':'进行中')+'）')]:[]),'## 主题整理',...r.groups.flatMap(g=>['### '+g.name,...g.entries.map(e=>'- '+e.title+' · '+kinds[e.kind])]),...(r.from!==r.to?['## 每日小结',...Array.from({length:7},(_,i)=>{const d=shift(r.from,i);return '### '+d+'\n\n'+makeReport(r.groups.flatMap(g=>g.entries),d,d).overview;})]:[]),'','按上海时区汇总；内容来自原始记录，分类可手动调整。'].join('\n\n');}
