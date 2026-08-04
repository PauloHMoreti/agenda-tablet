const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const DB_FILE = path.join(__dirname, 'data.json');

// ---------- Armazenamento simples em arquivo JSON (sem dependências nativas) ----------

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ blocks: [], nextBlockId: 1, nextLogId: 1 }, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // Garante os campos esperados, e migra o formato antigo (versão com "items")
  // para o novo formato baseado em "blocks", caso o arquivo seja de uma versão anterior.
  let changed = false;
  if (!Array.isArray(db.blocks)) {
    db.blocks = [];
    changed = true;
  }
  if (typeof db.nextBlockId !== 'number') { db.nextBlockId = db.blocks.length + 1; changed = true; }
  if (typeof db.nextLogId !== 'number') { db.nextLogId = 1; changed = true; }

  if (Array.isArray(db.items) && db.items.length > 0) {
    for (const it of db.items) {
      db.blocks.push({
        id: db.nextBlockId++,
        date: it.date,
        title: it.description,
        start_time: it.time,
        end_time: it.time,
        priority: 'media',
        completed: false,
        completed_at: null,
        created_at: it.created_at || new Date().toISOString(),
        logs: []
      });
    }
    delete db.items;
    delete db.nextId;
    changed = true;
  }

  if (changed) saveDB(db);
  return db;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

app.use(express.json());
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/control', express.static(path.join(__dirname, 'public/control')));

// ---------- Helpers de data/hora ----------

function nowParts() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const iso = tz.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function todayStr() {
  return nowParts().date;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const dt = new Date(dateStr + 'T12:00:00');
  return `${DIAS[dt.getDay()]}, ${d}/${m}/${y}`;
}

// ---------- Lógica de prioridade / status ----------

const PRIORITIES = {
  alta: { label: 'Alta', border: '#c0392f', bg: '#fdecea', text: '#7c231a' },
  media: { label: 'Média', border: '#c07f1f', bg: '#fef3e2', text: '#7a4f0f' },
  baixa: { label: 'Baixa', border: '#2f7d52', bg: '#eaf5ec', text: '#1f5236' }
};

function blockStatus(block) {
  if (block.completed) return 'concluida';
  const { date: curDate, time: curTime } = nowParts();
  const nowKey = curDate + 'T' + curTime;
  const endKey = block.date + 'T' + block.end_time;
  const startKey = block.date + 'T' + block.start_time;
  if (nowKey > endKey) return 'atrasada';
  if (nowKey >= startKey) return 'em_andamento';
  return 'pendente';
}

const STATUS_LABELS = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  atrasada: 'ATRASADA',
  concluida: 'Concluída'
};

function blocksForDate(db, date) {
  return db.blocks
    .filter(b => b.date === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m + minutes;
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
}

function serializeBlock(b) {
  return { ...b, status: blockStatus(b) };
}

// ---------- API ----------

app.get('/api/blocks', (req, res) => {
  const date = req.query.date || todayStr();
  const db = loadDB();
  res.json(blocksForDate(db, date).map(serializeBlock));
});

// Resumo do mês inteiro: quantos blocos por dia, e se há algum pendente/atrasado
app.get('/api/blocks/month', (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7); // "YYYY-MM"
  const db = loadDB();
  const summary = {};
  for (const b of db.blocks) {
    if (!b.date.startsWith(month)) continue;
    if (!summary[b.date]) summary[b.date] = { total: 0, concluidos: 0, atrasados: 0 };
    const s = serializeBlock(b);
    summary[b.date].total++;
    if (s.status === 'concluida') summary[b.date].concluidos++;
    if (s.status === 'atrasada') summary[b.date].atrasados++;
  }
  res.json(summary);
});

app.post('/api/blocks', (req, res) => {
  const { date, title, start_time, end_time, priority } = req.body;
  if (!date || !title || !start_time || !end_time) {
    return res.status(400).json({ error: 'campos obrigatórios: date, title, start_time, end_time' });
  }
  const db = loadDB();
  const block = {
    id: db.nextBlockId++,
    date, title, start_time, end_time,
    priority: PRIORITIES[priority] ? priority : 'media',
    completed: false,
    completed_at: null,
    created_at: new Date().toISOString(),
    logs: []
  };
  db.blocks.push(block);
  saveDB(db);
  res.json(serializeBlock(block));
});

app.put('/api/blocks/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  const { title, start_time, end_time, priority, date } = req.body;
  if (title !== undefined) block.title = title;
  if (start_time !== undefined) block.start_time = start_time;
  if (end_time !== undefined) block.end_time = end_time;
  if (date !== undefined) block.date = date;
  if (priority !== undefined && PRIORITIES[priority]) block.priority = priority;
  saveDB(db);
  res.json(serializeBlock(block));
});

app.delete('/api/blocks/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  db.blocks = db.blocks.filter(b => b.id !== id);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/blocks/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  block.completed = true;
  block.completed_at = new Date().toISOString();
  saveDB(db);
  res.json(serializeBlock(block));
});

app.post('/api/blocks/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  block.completed = false;
  block.completed_at = null;
  saveDB(db);
  res.json(serializeBlock(block));
});

app.post('/api/blocks/:id/extend', (req, res) => {
  const id = Number(req.params.id);
  const minutes = Number(req.body.minutes || 30);
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  block.end_time = addMinutesToTime(block.end_time, minutes);
  saveDB(db);
  res.json(serializeBlock(block));
});

app.post('/api/blocks/:id/logs', (req, res) => {
  const id = Number(req.params.id);
  const { description, time } = req.body;
  if (!description) return res.status(400).json({ error: 'description é obrigatório' });
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  const log = { id: db.nextLogId++, time: time || nowParts().time, description };
  block.logs.push(log);
  block.logs.sort((a, b) => a.time.localeCompare(b.time));
  saveDB(db);
  res.json(serializeBlock(block));
});

app.delete('/api/blocks/:id/logs/:logId', (req, res) => {
  const id = Number(req.params.id);
  const logId = Number(req.params.logId);
  const db = loadDB();
  const block = db.blocks.find(b => b.id === id);
  if (!block) return res.status(404).json({ error: 'bloco não encontrado' });
  block.logs = block.logs.filter(l => l.id !== logId);
  saveDB(db);
  res.json(serializeBlock(block));
});

app.post('/api/blocks/copy', (req, res) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate e toDate são obrigatórios' });
  const db = loadDB();
  const source = blocksForDate(db, fromDate);
  for (const b of source) {
    db.blocks.push({
      id: db.nextBlockId++,
      date: toDate,
      title: b.title,
      start_time: b.start_time,
      end_time: b.end_time,
      priority: b.priority,
      completed: false,
      completed_at: null,
      created_at: new Date().toISOString(),
      logs: []
    });
  }
  saveDB(db);
  res.json({ copied: source.length });
});

// ---------- Tela 1: Display do tablet (sem JS, compatível com Android 2.3) ----------

app.get('/display', (req, res) => {
  const date = req.query.date || todayStr();
  const db = loadDB();
  const allBlocks = blocksForDate(db, date).map(serializeBlock);
  const concluidos = allBlocks.filter(b => b.status === 'concluida').length;
  const blocks = allBlocks.filter(b => b.status !== 'concluida');

  const cards = blocks.map(b => {
    const p = PRIORITIES[b.priority] || PRIORITIES.media;
    const isLate = b.status === 'atrasada';
    const borderColor = isLate ? '#a3241a' : p.border;
    const logsHtml = b.logs.length
      ? '<table class="logs">' + b.logs.map(l => `
          <tr><td class="lt">${escapeHtml(l.time)}</td><td class="ld">${escapeHtml(l.description)}</td></tr>
        `).join('') + '</table>'
      : '';
    return `
    <div class="card" style="border-left-color:${borderColor}; background:${p.bg};">
      <div class="head">
        <span class="range">${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</span>
        <span class="title">${escapeHtml(b.title)}</span>
        <span class="badge ${isLate ? 'late' : ''}" style="${isLate ? '' : `color:${p.text};border-color:${p.border};`}">
          ${isLate ? 'ATRASADA' : STATUS_LABELS[b.status]}
        </span>
      </div>
      ${logsHtml}
    </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta http-equiv="refresh" content="120">
<title>Agenda</title>
<style>
  body { background:#ffffff; margin:0; padding:32px; font-family: Arial, Helvetica, sans-serif; }
  h1 { font-size: 28px; margin: 0 0 20px 0; }
  .card { border-left: 10px solid #ccc; border-radius: 4px; padding: 14px 18px; margin-bottom: 16px; }
  .head { display: table; width: 100%; }
  .range { display: table-cell; font-weight: bold; font-size: 24px; width: 150px; white-space: nowrap; vertical-align: middle; }
  .title { display: table-cell; font-size: 26px; vertical-align: middle; }
  .badge { display: table-cell; text-align: right; vertical-align: middle; font-size: 16px; font-weight: bold;
           border: 2px solid #999; border-radius: 6px; padding: 4px 10px; white-space: nowrap; width: 150px; }
  .badge.late { background:#a3241a; color:#fff; border-color:#a3241a; }
  table.logs { border-collapse: collapse; width: 100%; margin-top: 10px; }
  table.logs td { font-size: 19px; padding: 4px 8px; color: #333; }
  table.logs .lt { font-weight: bold; width: 90px; white-space: nowrap; }
  .empty { font-size: 24px; color: #555555; margin-top: 20px; }
  .updated { position:absolute; bottom:14px; right:20px; font-size:14px; color:#999999; }
</style>
</head>
<body>
<h1>${escapeHtml(formatDateLabel(date))}</h1>
${cards}
${blocks.length === 0 ? `<div class="empty">${allBlocks.length === 0 ? 'Nada agendado para hoje.' : 'Tudo concluído por hoje! 🎉'}</div>` : ''}
<div class="updated">${concluidos > 0 ? `${concluidos} concluída${concluidos > 1 ? 's' : ''} hoje &middot; ` : ''}atualizado ${new Date().toLocaleTimeString('pt-BR')}</div>
</body>
</html>`);
});

app.get('/', (req, res) => res.redirect('/display'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando: http://<ip-do-servidor>:${PORT}`);
  console.log(`  - Tela do tablet (passiva):     http://<ip-do-servidor>:${PORT}/display`);
  console.log(`  - Painel admin (criar/editar):  http://<ip-do-servidor>:${PORT}/admin`);
  console.log(`  - Tela de controle (celular):   http://<ip-do-servidor>:${PORT}/control`);
});
