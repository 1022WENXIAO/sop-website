// SOP 团队版后端服务（零依赖，Node.js 原生实现）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    cats: ['通用', '运维', '行政'],
    sops: [{
      id: 1, title: '示例：服务器重启流程', cat: '运维', status: 'active',
      desc: '生产服务器计划性重启的标准流程。这是团队共享数据，所有成员看到的是同一份。',
      steps: ['提前 24 小时在群里发布公告', '备份关键数据', '按顺序停止应用服务', '重启服务器并等待就绪', '启动应用服务并验证', '更新运维日志'],
      done: [0, 1], updatedAt: Date.now(), updatedBy: '系统'
    }]
  }, null, 2));
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([
    { user: 'admin', pass: 'admin123', name: '管理员' },
    { user: 'demo', pass: 'demo123', name: '演示账号' }
  ], null, 2));
}

const tokens = new Map(); // token -> {user, name, expires}
const TOKEN_TTL = 7 * 24 * 3600 * 1000;

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function backupData() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const bdir = path.join(__dirname, 'backups');
    const dst = path.join(__dirname, 'backups', `data-${day}.json`);
    fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(DATA_FILE, dst);
    // 只保留最近 30 天备份
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(bdir)) {
      const m = f.match(/^data-(\d{4}-\d{2}-\d{2})\.json$/);
      if (m && new Date(m[1]).getTime() < cutoff) fs.unlinkSync(path.join(bdir, f));
    }
  } catch (e) {}
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function auth(req) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  const rec = tokens.get(t);
  if (!rec || Date.now() > rec.expires) { tokens.delete(t); return null; }
  return rec;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { user, pass } = JSON.parse(body);
        const users = readJSON(USERS_FILE) || [];
        const u = users.find(x => x.user === user && x.pass === pass);
        if (!u) return json(res, 401, { ok: false, error: '用户名或密码错误' });
        const token = crypto.randomBytes(24).toString('hex');
        tokens.set(token, { user: u.user, name: u.name, expires: Date.now() + TOKEN_TTL });
        json(res, 200, { ok: true, token, name: u.name });
      } catch (e) { json(res, 400, { ok: false, error: '请求格式错误' }); }
    });
    return;
  }

  if (url.pathname === '/api/data' && req.method === 'GET') {
    const me = auth(req);
    if (!me) return json(res, 401, { ok: false, error: '未登录' });
    return json(res, 200, readJSON(DATA_FILE));
  }

  if (url.pathname === '/api/data' && req.method === 'PUT') {
    const me = auth(req);
    if (!me) return json(res, 401, { ok: false, error: '未登录' });
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!Array.isArray(d.sops) || !Array.isArray(d.cats)) throw 0;
        backupData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { ok: false, error: '数据格式错误' }); }
    });
    return;
  }

  if (url.pathname === '/api/health') return json(res, 200, { ok: true });

  // 静态文件
  let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('Not Found'); }
  const ext = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(p)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ext });
  fs.createReadStream(p).pipe(res);
});

server.listen(PORT, () => {
  console.log(`✅ SOP 团队版服务已启动: http://localhost:${PORT}`);
  console.log('   局域网同事请访问: http://<你的IP>:' + PORT);
  console.log('   默认账号: admin / admin123（可在 server/users.json 中添加成员）');
});
