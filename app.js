(() => {
  // Device-local edit guard. This is not server-side authorization.
  const EDIT_KEY_69232a3b0eade462075c48bb2e6a44645e470759d6a0a0451d058961daeca3c8 = '69232a3b0eade462075c48bb2e6a44645e470759d6a0a0451d058961daeca3c8';
  async function verifyEditKey(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('') === EDIT_KEY_69232a3b0eade462075c48bb2e6a44645e470759d6a0a0451d058961daeca3c8;
  }
  function requireEditKey(action) {
    if(document.getElementById('edit-key-dialog')) return Promise.resolve(false);
    return new Promise(resolve => {
      const dialog=document.createElement('dialog');dialog.id='edit-key-dialog';dialog.className='key-dialog';
      dialog.setAttribute('aria-labelledby','key-title');
      dialog.innerHTML=`<form class="key-form"><span class="section-kicker">编辑保护</span><h2 id="key-title">确认${action}</h2><p>请输入编辑密钥后继续。本次验证仅用于当前操作。</p><label>编辑密钥<input name="key" type="password" required autocomplete="off" placeholder="输入密钥"></label><p class="key-error" role="alert" aria-live="polite"></p><div class="key-actions"><button type="button" class="toolbar-btn" id="cancel-key">取消</button><button type="submit" class="toolbar-btn primary">验证并继续</button></div></form>`;
      document.body.append(dialog);const field=dialog.querySelector('input');
      const finish=ok=>{dialog.close();dialog.remove();resolve(ok)};
      dialog.querySelector('#cancel-key').onclick=()=>finish(false);
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
      dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type="submit"]');button.disabled=true;try{if(await verifyEditKey(field.value)){field.value='';finish(true);return}dialog.querySelector('.key-error').textContent='密钥不正确，请重新输入。';field.select()}catch{dialog.querySelector('.key-error').textContent='验证失败，请通过 HTTPS 或 localhost 访问网站。'}finally{button.disabled=false}};
      dialog.showModal();field.focus();
    });
  }
  const STORE_KEY='edge-vla-wam-atlas.records.v1';
  const validRecord = p => p && typeof p==='object' && typeof p.id==='string' && typeof p.title==='string' && typeof p.url==='string' && /^https:\/\//.test(p.url) && Array.isArray(p.methods) && Array.isArray(p.metrics);
  let papers=PAPERS;
  try { const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(Array.isArray(saved)&&saved.every(validRecord)) papers=saved; } catch {}
  const persist = () => localStorage.setItem(STORE_KEY,JSON.stringify(papers));
  const state = { family:'全部', kind:'全部', model:'全部', hardware:'全部', year:'全部', venue:'全部', team:'全部', methods:new Set(), query:'', measured:false, selected:null };
  const app = document.getElementById('app');
  const clean = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modelOptions = ['全部',...new Set(papers.map(p=>p.model))].sort((a,b)=>a==='全部'?-1:b==='全部'?1:a.localeCompare(b,'zh'));
  const hardwareOptions = ['全部','Jetson Orin','边缘 GPU','消费级 GPU / CPU','异构边缘设备','物理机器人 / 板卡未明','通用 GPU','通用计算','未报告'];
  const venueOptions = ['全部',...new Set(papers.map(p=>p.venue))].sort((a,b)=>a==='全部'?-1:b==='全部'?1:a.localeCompare(b,'zh'));
  const teamOptions = ['全部',...new Set(papers.map(p=>p.team))].sort((a,b)=>a==='全部'?-1:b==='全部'?1:a.localeCompare(b,'zh'));
  const baseMethods = ['量化','剪枝','蒸馏','编译 / 运行时','异步调度','动作解码','架构'];
  let methodOptions = [...new Set([...baseMethods,...papers.flatMap(p=>p.methods)])];
  const options = (values, current) => values.map(x=>`<option value="${clean(x)}" ${current===x?'selected':''}>${clean(x)}</option>`).join('');
  const filters = () => papers.filter(p => {
    const q = state.query.trim().toLocaleLowerCase();
    return (state.family==='全部'||p.family.split(' / ').includes(state.family)) && (state.kind==='全部'||p.kind===state.kind) && (state.model==='全部'||p.model===state.model) && (state.hardware==='全部'||p.hardware===state.hardware) && (state.year==='全部'||String(p.year)===state.year) && (state.venue==='全部'||p.venue===state.venue) && (state.team==='全部'||p.team===state.team) && (!state.measured||['Jetson Orin','边缘 GPU','异构边缘设备'].includes(p.hardware)) && (!state.methods.size||[...state.methods].some(m=>p.methods.includes(m))) && (!q||[p.title,p.authors,p.model,p.contribution,p.id,p.venue,p.team,...p.methods].join(' ').toLocaleLowerCase().includes(q));
  });
  const metric = p => p.metrics.length ? `<div class="metric-inline"><strong>${clean(p.metrics[0][0])}</strong><span>${clean(p.metrics[0][1])}</span></div>` : `<span class="muted">未摘录量化指标</span>`;
  const row = p => `<article class="paper" data-id="${p.id}" tabindex="0" role="button" aria-label="查看 ${clean(p.title)} 详情">
    <div class="paper-main"><div class="topline"><span class="family ${p.family.includes('WAM')?'wam':''}">${clean(p.family)}</span><span class="kind">${clean(p.kind)}</span><span class="year">${p.year}</span><span class="credibility">${clean(p.credibility)}</span></div>
    <h3>${clean(p.title)}</h3><p class="authors">${clean(p.authors)} <span>· ${clean(p.id)}</span></p><p class="meta-line">${clean(p.date)}　·　${clean(p.venue)}　·　${clean(p.team)}</p><p class="summary">${clean(p.contribution)}</p><div class="chips">${p.methods.map(m=>`<span>${clean(m)}</span>`).join('')}</div></div>
    <div class="paper-side"><span class="side-label">模型 / 硬件证据</span><strong>${clean(p.model)}</strong><span class="hardware">${clean(p.hardware)}</span><div class="side-line"></div><span class="side-label">论文报告</span>${metric(p)}<span class="row-action">查看详情 <span aria-hidden="true">↗</span></span></div></article>`;
  function renderList(){
    const found=filters();
    document.getElementById('result-count').textContent=`${found.length} 篇结果`;
    document.querySelector('.nav-count').textContent=String(papers.length);
    document.querySelector('.intro-stat>strong').textContent=String(papers.length);
    document.querySelector('.intro-stat>div').innerHTML=`<b>${papers.filter(p=>p.kind==='综述').length}</b> 篇综述 <span>·</span> <b>${papers.filter(p=>p.hardware==='Jetson Orin').length}</b> 篇 Jetson 记录`;
    document.getElementById('list').innerHTML= found.length ? found.map(row).join('') : `<div class="empty"><div class="empty-icon">⌕</div><h3>没有符合条件的论文</h3><p>减少筛选条件或清除搜索词后重试。</p><button id="empty-reset">清除筛选</button></div>`;
    document.querySelectorAll('.paper').forEach(el=>{
      el.addEventListener('click',()=>openPaper(el.dataset.id));
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPaper(el.dataset.id)}});
    });
    document.getElementById('empty-reset')?.addEventListener('click',reset);
    document.getElementById('active-count').textContent=String([state.family!=='全部',state.kind!=='全部',state.model!=='全部',state.hardware!=='全部',state.year!=='全部',state.venue!=='全部',state.team!=='全部',state.measured,state.query.trim()!=='',...state.methods].filter(Boolean).length);
  }
  function details(p){
    return `<div class="drawer-header"><div><span class="detail-eyebrow">${clean(p.kind)} · ${clean(p.family)} · ${p.year}</span><h2 id="detail-title">${clean(p.title)}</h2><p>${clean(p.authors)} · ${clean(p.id)}</p><p class="detail-meta">${clean(p.date)}　·　${clean(p.venue)}<br>研究团队：${clean(p.team)} · 可信度：${clean(p.credibility)}</p></div><button id="close-detail" class="close" aria-label="关闭论文详情">×</button></div>
    <div class="drawer-scroll"><div class="detail-section"><h3>关键贡献</h3><p>${clean(p.contribution)}</p></div>
    <div class="detail-section"><h3>部署与加速证据</h3><div class="evidence"><div><span>研究模型</span><strong>${clean(p.model)}</strong></div><div><span>硬件 / 证据范围</span><strong>${clean(p.hardware)}</strong></div></div>
    ${p.metrics.length?`<div class="metric-grid">${p.metrics.map(([v,l])=>`<div class="metric-box"><strong>${clean(v)}</strong><span>${clean(l)}</span></div>`).join('')}</div>`:`<p class="no-metric">论文摘要或本库未提供可比的端侧部署指标。</p>`}
    <p class="evidence-note"><strong>口径说明</strong>${clean(p.context)}</p></div>
    <div class="detail-section"><h3>方法标签</h3><div class="chips detail-chips">${p.methods.map(x=>`<span>${clean(x)}</span>`).join('')}</div></div>
    <div class="detail-section"><h3>原始来源</h3><p class="source-note">标题、作者、提交年份与指标均可回到论文原始页面核查。加速倍数和成功率取作者报告值，未跨不同任务与设备作横向排名。</p><a class="source-link" href="${clean(p.url)}" target="_blank" rel="noopener noreferrer">打开论文原文 <span aria-hidden="true">↗</span></a><div class="record-actions"><button id="edit-paper" class="toolbar-btn">编辑记录</button><button id="delete-paper" class="toolbar-btn danger">删除记录</button></div></div></div>`;
  }
  function openPaper(id){const p=papers.find(p=>p.id===id);if(!p)return;state.selected=p.id;document.getElementById('drawer').innerHTML=details(p);document.getElementById('dialog-wrap').hidden=false;document.body.classList.add('dialog-open');history.replaceState(null,'',`#${id}`);document.getElementById('close-detail').focus();document.getElementById('close-detail').addEventListener('click',closePaper);document.getElementById('edit-paper')?.addEventListener('click',()=>openEditor(p.id));document.getElementById('delete-paper')?.addEventListener('click',()=>deletePaper(p.id));}
  function closePaper(){state.selected=null;document.getElementById('dialog-wrap').hidden=true;document.body.classList.remove('dialog-open');history.replaceState(null,'',location.pathname+location.search);}
  function reset(){state.family='全部';state.kind='全部';state.model='全部';state.hardware='全部';state.year='全部';state.venue='全部';state.team='全部';state.methods.clear();state.query='';state.measured=false;document.getElementById('search').value='';document.querySelectorAll('select').forEach(s=>s.value='全部');document.getElementById('measured').checked=false;document.querySelectorAll('[data-family],[data-kind],[data-method]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.family==='全部'||b.dataset.kind==='全部')));renderList();}
  async function openEditor(id){
    if(!await requireEditKey(id?'修改文章':'添加文章'))return;
    const p=id?papers.find(x=>x.id===id):null, edit=!!p;
    const value=(key,fallback='')=>clean(p?.[key]??fallback);
    const methodValue=p?.methods?.join(', ')||'';
    const metricValue=p?.metrics?.map(([v,l])=>`${v} | ${l}`).join('; ')||'';
    document.getElementById('drawer').innerHTML=`<div class="drawer-header"><div><span class="detail-eyebrow">${edit?'编辑文献':'新增文献'}</span><h2 id="detail-title">${edit?'修改文章信息':'添加一篇文章'}</h2><p>带 * 的字段必填。修改保存在当前浏览器。</p></div><button id="close-detail" class="close" aria-label="关闭">×</button></div><form id="paper-form" class="drawer-scroll editor-form">
      <label>标题 *<input name="title" required maxlength="400" value="${value('title')}" placeholder="论文完整标题"></label>
      <div class="form-grid"><label>记录 ID *<input name="id" required maxlength="100" value="${value('id',`local-${Date.now()}`)}" ${edit?'readonly':''} placeholder="arXiv ID 或自定义 ID"></label><label>论文原文 URL *<input name="url" required type="url" value="${value('url')}" placeholder="https://…"></label></div>
      <div class="form-grid"><label>作者 / 工作室<input name="authors" value="${value('authors')}" placeholder="作者名单或实验室"></label><label>研究团队 / 工作室<input name="team" value="${value('team')}" placeholder="机构 / 工作室"></label></div>
      <div class="form-grid"><label>发表日期 *<input name="date" type="date" required value="${value('date',new Date().toISOString().slice(0,10))}"></label><label>发表场所 / venue<input name="venue" value="${value('venue','arXiv 预印本')}" placeholder="会议、期刊或 arXiv"></label></div>
      <div class="form-grid"><label>研究对象<select name="family"><option ${!p||p.family==='VLA'?'selected':''}>VLA</option><option ${p?.family==='WAM'?'selected':''}>WAM</option><option ${p?.family==='VLA / WAM'?'selected':''}>VLA / WAM</option></select></label><label>论文类型<select name="kind">${['综述','模型论文','加速方法','部署实测'].map(x=>`<option ${p?.kind===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
      <div class="form-grid"><label>年份 *<input name="year" type="number" min="2000" max="2100" required value="${value('year',new Date().getFullYear())}"></label><label>可信度 / 状态<input name="credibility" value="${value('credibility','待核/预印本')}" placeholder="顶会主会、Workshop、预印本"></label></div>
      <div class="form-grid"><label>模型<input name="model" value="${value('model','未注明')}"></label><label>硬件 / 证据范围<input name="hardware" value="${value('hardware','未报告')}"></label></div>
      <label>加速方法标签<input name="methods" value="${clean(methodValue)}" placeholder="量化, 剪枝, 编译 / 运行时"></label>
      <label>关键贡献 / 摘要<textarea name="contribution" rows="4">${value('contribution')}</textarea></label>
      <label>端侧指标（每项写“数值 | 说明”，用分号分开）<textarea name="metrics" rows="3" placeholder="1.5× | 推理加速; 80 ms | 端到端延迟">${clean(metricValue)}</textarea></label>
      <label>指标口径 / 备注<textarea name="context" rows="3">${value('context')}</textarea></label>
      <div class="form-actions"><button type="button" id="cancel-editor" class="toolbar-btn">取消</button><button type="submit" class="toolbar-btn primary">${edit?'保存修改':'添加到文献库'}</button></div>
    </form>`;
    document.getElementById('dialog-wrap').hidden=false;document.body.classList.add('dialog-open');
    document.getElementById('close-detail').addEventListener('click',closePaper);document.getElementById('cancel-editor').addEventListener('click',closePaper);
    document.getElementById('paper-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const raw=Object.fromEntries(f.entries());const url=String(raw.url).trim();if(!/^https:\/\//i.test(url)){alert('论文链接必须使用 https://');return;}
      const methods=String(raw.methods).split(/[,，、]/).map(x=>x.trim()).filter(Boolean);const metrics=String(raw.metrics).split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('|');return i<0?[x,'作者报告指标']:[x.slice(0,i).trim(),x.slice(i+1).trim()||'作者报告指标']});
      const next={...p,...raw,id:String(raw.id).trim(),title:String(raw.title).trim(),url,year:Number(raw.year),methods,metrics,contribution:String(raw.contribution).trim(),context:String(raw.context).trim(),authors:String(raw.authors).trim()||'作者未注明',team:String(raw.team).trim()||'团队未注明',venue:String(raw.venue).trim()||'未注明',model:String(raw.model).trim()||'未注明',hardware:String(raw.hardware).trim()||'未报告',credibility:String(raw.credibility).trim()||'待核/预印本'};
      if(!next.title||!Number.isInteger(next.year)||!next.date){alert('请检查标题、发表日期和年份。');return;}if(!edit&&papers.some(x=>x.id===next.id)){alert('这个记录 ID 已存在，请更换 ID。');return;}
      if(edit)papers=papers.map(x=>x.id===id?next:x);else papers=[next,...papers];persist();populateSelects();populateMethodControls();closePaper();renderList();
    });
  }
  function bindMethodControls(){document.querySelectorAll('[data-method]').forEach(b=>b.addEventListener('click',()=>{const x=b.dataset.method;state.methods.has(x)?state.methods.delete(x):state.methods.add(x);b.setAttribute('aria-pressed',String(state.methods.has(x)));renderList()}));}
  function populateMethodControls(){methodOptions=[...new Set([...baseMethods,...papers.flatMap(p=>p.methods)])];const root=document.getElementById('method-controls');root.innerHTML=methodOptions.map(m=>`<button data-method="${clean(m)}" aria-pressed="${state.methods.has(m)}">${clean(m)}</button>`).join('');bindMethodControls();}
  function populateSelects(){
    const values={model:['全部',...new Set(papers.map(p=>p.model))],venue:['全部',...new Set(papers.map(p=>p.venue))],team:['全部',...new Set(papers.map(p=>p.team))],year:['全部',...new Set(papers.map(p=>String(p.year)))]};
    for(const [key,list] of Object.entries(values)){const el=document.getElementById(key);const current=state[key];el.innerHTML=options(list.sort((a,b)=>a==='全部'?-1:b==='全部'?1:a.localeCompare(b,'zh')),list.includes(current)?current:'全部');if(!list.includes(current))state[key]='全部';}
  }
  async function deletePaper(id){if(!await requireEditKey('删除文章'))return;const p=papers.find(x=>x.id===id);if(!p||!confirm(`删除这篇文章？\n${p.title}`))return;papers=papers.filter(x=>x.id!==id);persist();populateSelects();populateMethodControls();closePaper();renderList();}
  function exportRecords(){const blob=new Blob([JSON.stringify(papers,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='edge-vla-wam-library.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function importRecords(e){const file=e.target.files?.[0];if(!file)return;try{if(!await requireEditKey('导入文章'))return;const incoming=JSON.parse(await file.text());if(!Array.isArray(incoming)||!incoming.every(validRecord)){alert('文件格式不正确：需要论文数组，且论文链接必须为 HTTPS。');return;}if(!confirm(`导入 ${incoming.length} 篇记录？同 ID 记录将以导入文件为准。`))return;const map=new Map(papers.map(p=>[p.id,p]));incoming.forEach(p=>map.set(p.id,p));papers=[...map.values()];persist();populateSelects();populateMethodControls();renderList();alert(`已导入并保存 ${incoming.length} 篇记录。`);}catch{alert('无法读取该 JSON 文件。');}finally{e.target.value='';}}
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">E<span>/</span></span><div><strong>EMBODIED<span class="brand-accent"> / LAB</span></strong><small>RESEARCH INDEX · 2026</small></div></div><div class="sidebar-caption">研究视图</div><div class="nav-current"><span class="nav-icon">▤</span> 文献探索 <span class="nav-count">${papers.length}</span></div><div class="sidebar-divider"></div><div class="sidebar-caption">阅读路径</div><button class="side-shortcut" id="surveys-shortcut"><span>01</span> 先读综述 <span>↗</span></button><button class="side-shortcut" id="edge-shortcut"><span>02</span> 看端侧实测 <span>↗</span></button><button class="side-shortcut" id="wam-shortcut"><span>03</span> 跟进 WAM <span>↗</span></button><div class="sidebar-bottom"><div class="sidebar-note"><span class="sidebar-note-icon">i</span><p>硬件标签表示论文报告的测量范围；“端侧”结论需结合任务、批量与功耗核查。</p></div><small>资料核对 · 2026-09-28</small></div></aside>
  <div class="workspace"><header class="topbar"><div class="breadcrumb">研究工作台 <span>/</span> 文献探索</div><div class="toolbar-actions"><label class="import-btn">导入 JSON<input id="import-json" type="file" accept="application/json,.json" hidden></label><button id="export-json" class="toolbar-btn">导出备份</button><button id="add-paper" class="toolbar-btn primary">＋ 添加文章</button><span class="private-badge"><span class="lock">🔒</span> 私密文献库</span></div></header><div class="content"><div class="intro"><div><div class="overline">EDGE EMBODIED INTELLIGENCE / LITERATURE EXPLORER</div><h1>端侧具身智能<span>文献探索</span></h1><p>从 VLA / WAM 综述到模型压缩与板载部署，按证据范围检索原始论文。</p></div><div class="intro-stat"><strong>${papers.length}</strong><span>已核验论文</span><div><b>${papers.filter(p=>p.kind==='综述').length}</b> 篇综述 <span>·</span> <b>${papers.filter(p=>p.hardware==='Jetson Orin').length}</b> 篇 Jetson 记录</div></div></div>
  <section class="explorer" aria-label="论文筛选"><div class="explorer-head"><div><span class="section-kicker">01 / DISCOVER</span><h2>筛选文献</h2></div><button id="reset" class="reset-btn">清除筛选 <span id="active-count">0</span></button></div>
  <div class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="搜索论文、模型、作者、arXiv 编号或方法…" aria-label="搜索论文"></div>
  <div class="filter-row"><div class="filter-block"><span class="filter-label">研究对象</span><div class="segmented" id="family-controls">${['全部','VLA','WAM'].map(x=>`<button data-family="${x}" aria-pressed="${x==='全部'}">${x}</button>`).join('')}</div></div><div class="filter-block"><span class="filter-label">论文类型</span><div class="segmented" id="kind-controls">${['全部','综述','模型论文','加速方法','部署实测'].map(x=>`<button data-kind="${x}" aria-pressed="${x==='全部'}">${x}</button>`).join('')}</div></div></div>
  <div class="select-row"><label>模型 <select id="model">${options(modelOptions,'全部')}</select></label><label>端侧硬件 / 证据 <select id="hardware">${options(hardwareOptions,'全部')}</select></label><label>年份 <select id="year">${options([...new Set(['全部',...papers.map(p=>String(p.year))])],'全部')}</select></label><label>发表场所 <select id="venue">${options(venueOptions,'全部')}</select></label><label>研究团队 / 工作室 <select id="team">${options(teamOptions,'全部')}</select></label></div>
  <div class="methods"><span class="filter-label">加速方法 <em>可多选，匹配任一</em></span><div id="method-controls">${methodOptions.map(m=>`<button data-method="${m}" aria-pressed="false">${m}</button>`).join('')}</div></div><label class="measure-toggle"><input type="checkbox" id="measured"><span class="switch-ui"></span><span>仅看明确报告边缘设备测量的论文</span></label></section>
  <section class="results" aria-label="检索结果"><div class="results-head"><div><span class="section-kicker">02 / PAPERS</span><h2>论文列表 <span id="result-count"></span></h2></div><div class="sort-label">按年份降序 · 作者报告值</div></div><div id="list" aria-live="polite"></div><p class="footer-note">收录范围为人工精选的研究起点，尚非穷尽性系统综述。添加、编辑和删除保存在当前浏览器，不会跨设备自动同步；可用“导出备份 / 导入 JSON”迁移。各指标保留原论文的任务和硬件语境。</p></section></div></div></div>
  <div id="dialog-wrap" class="dialog-wrap" hidden><div class="backdrop" id="backdrop"></div><aside id="drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"></aside></div>`;
  renderList();
  document.getElementById('add-paper').addEventListener('click',()=>openEditor());
  document.getElementById('export-json').addEventListener('click',exportRecords);
  document.getElementById('import-json').addEventListener('change',importRecords);
  document.getElementById('search').addEventListener('input',e=>{state.query=e.target.value;renderList()});
  for(const key of ['model','hardware','year','venue','team']) document.getElementById(key).addEventListener('change',e=>{state[key]=e.target.value;renderList()});
  for(const key of ['family','kind']) document.querySelectorAll(`[data-${key}]`).forEach(b=>b.addEventListener('click',()=>{state[key]=b.dataset[key];document.querySelectorAll(`[data-${key}]`).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderList()}));
  bindMethodControls();
  document.getElementById('measured').addEventListener('change',e=>{state.measured=e.target.checked;renderList()});
  document.getElementById('reset').addEventListener('click',reset);
  document.getElementById('backdrop').addEventListener('click',closePaper);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('edit-key-dialog')&&!document.getElementById('dialog-wrap').hidden)closePaper()});
  document.getElementById('surveys-shortcut').addEventListener('click',()=>{reset();document.querySelector('[data-kind="综述"]').click();document.querySelector('.explorer').scrollIntoView({behavior:'smooth'})});
  document.getElementById('edge-shortcut').addEventListener('click',()=>{reset();document.getElementById('measured').click();document.querySelector('.explorer').scrollIntoView({behavior:'smooth'})});
  document.getElementById('wam-shortcut').addEventListener('click',()=>{reset();document.querySelector('[data-family="WAM"]').click();document.querySelector('.explorer').scrollIntoView({behavior:'smooth'})});
  if(location.hash && /^#[0-9]{4}\.[0-9]{5}$/.test(location.hash)) openPaper(location.hash.slice(1));
})();
