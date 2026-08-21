const svg = document.querySelector('#city-map');
const packetLayer = document.querySelector('#packets');
const toggleButton = document.querySelector('#toggle-sim');
const pulseButton = document.querySelector('#pulse-btn');
const speedRange = document.querySelector('#speed-range');
const speedLabel = document.querySelector('#speed-label');
const loadFill = document.querySelector('#load-fill');
const loadLabel = document.querySelector('#load-label');
const packetList = document.querySelector('#packet-list');
const packetCount = document.querySelector('#packet-count');

const nodes = {
  root: { title: 'Root Complex', copy: 'PCIe 城市的入口。Root Complex 將 CPU / 記憶體的請求轉成 TLP，並把它們送入 Fabric。', address: '00:00.0', state: 'L0 · ACTIVE', width: 'x16', rate: '7.84', latency: '118', traffic: 'TC0 · BEST EFFORT', color: 'root' },
  switch: { title: 'Fabric Switch', copy: '所有資料流在此交會。Switch 依照目的地與路由規則，將 TLP 封包送往正確的 Endpoint。', address: '01:00.0', state: 'L0 · ACTIVE', width: 'x16', rate: '7.84', latency: '112', traffic: 'TC0 · BEST EFFORT', color: 'switch' },
  gpu: { title: 'GPU Foundry', copy: '高頻寬繪圖區。這條 x8 Downlink 正在接收大量 Memory Write，讓畫面保持流暢。', address: '01:00.0', state: 'L0 · ACTIVE', width: 'x8', rate: '7.72', latency: '146', traffic: 'TC1 · VIDEO', color: 'gpu' },
  storage: { title: 'NVMe Storage', copy: '非揮發性儲存區。Completion 封包會沿著同一條 Link 回到 Root Complex。', address: '02:00.0', state: 'L0 · ACTIVE', width: 'x4', rate: '6.91', latency: '188', traffic: 'TC0 · BEST EFFORT', color: 'storage' },
  network: { title: 'Network Edge', copy: '網路邊境節點。封包在這裡離開 PCIe Fabric，前往更遠的服務與裝置。', address: '03:00.0', state: 'L0 · ACTIVE', width: 'x4', rate: '5.43', latency: '214', traffic: 'TC2 · LOW LATENCY', color: 'network' },
  audio: { title: 'Audio Quarter', copy: '低延遲音訊街區。即使整座城市繁忙，Isochronous stream 仍保有穩定節奏。', address: '04:00.0', state: 'L0 · ACTIVE', width: 'x1', rate: '2.48', latency: '164', traffic: 'TC3 · ISOCHRONOUS', color: 'audio' }
};

const routes = {
  rootSwitch: [[174, 365], [330, 328], [489, 288]],
  switchGpu: [[489, 288], [609, 246], [807, 192]],
  switchStorage: [[489, 288], [492, 374], [499, 422]],
  switchNetwork: [[489, 288], [642, 324], [859, 292]],
  switchAudio: [[489, 288], [378, 365], [265, 415]]
};
const destinationRoutes = { gpu: 'switchGpu', storage: 'switchStorage', network: 'switchNetwork', audio: 'switchAudio' };
const endpoints = Object.keys(destinationRoutes);
let selectedNode = 'switch';
let running = true;
let speed = 1;
let mode = 'balanced';
let currentLoad = 64;
let packetSequence = 8;
let lastFrame = performance.now();
let packetAccumulator = 0;
let logClock = 0;
const activePackets = [];
let explorerReady = false;

function lerp(a, b, amount) { return a + (b - a) * amount; }
function routePoint(points, progress) {
  if (progress <= 0) return points[0];
  if (progress >= 1) return points[points.length - 1];
  const scaled = progress * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return [lerp(points[index][0], points[index + 1][0], local), lerp(points[index][1], points[index + 1][1], local)];
}
function routePath(packet) {
  const destination = packet.destination;
  if (packet.origin === 'root' && destination === 'switch') return routes.rootSwitch;
  if (packet.origin === 'switch' && destination === 'root') return [...routes.rootSwitch].reverse();
  const route = routes[destinationRoutes[destination]];
  return packet.origin === 'switch' ? route : [...route].reverse();
}
function makePacket({ origin = 'switch', destination = endpoints[Math.floor(Math.random() * endpoints.length)], reply = false, burst = false, manual = false } = {}) {
  const packet = { id: ++packetSequence, origin, destination, reply, burst, manual, progress: 0, speed: (burst ? .26 : .17) + Math.random() * .06, born: performance.now() };
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.classList.add('packet');
  if (reply) circle.classList.add('reply');
  if (burst) circle.classList.add('burst');
  circle.setAttribute('r', burst ? '5' : '3.6');
  packet.el = circle;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.classList.add('packet-ring');
  if (reply) ring.classList.add('reply');
  ring.setAttribute('r', burst ? '7' : '6');
  packet.ring = ring;
  packetLayer.append(circle, ring);
  activePackets.push(packet);
  return packet;
}
function removePacket(packet) {
  packet.el.remove();
  packet.ring.remove();
  const index = activePackets.indexOf(packet);
  if (index > -1) activePackets.splice(index, 1);
}
function seedPackets() {
  for (let i = 0; i < 8; i += 1) {
    const destination = endpoints[i % endpoints.length];
    const packet = makePacket({ destination, reply: i % 3 === 0 });
    packet.progress = (i * .125) % .72;
  }
}
function spawnFromTraffic() {
  if (!running) return;
  const probability = mode === 'burst' ? .95 : mode === 'quiet' ? .28 : .58;
  if (Math.random() > probability) return;
  const destination = endpoints[Math.floor(Math.random() * endpoints.length)];
  const origin = Math.random() > .78 ? 'root' : 'switch';
  const target = origin === 'root' ? 'switch' : destination;
  makePacket({ origin, destination: target, reply: Math.random() > .68, burst: mode === 'burst' && Math.random() > .45 });
}
function updatePackets(delta) {
  for (const packet of [...activePackets]) {
    packet.progress += packet.speed * delta * speed;
    const [x, y] = routePoint(routePath(packet), packet.progress);
    packet.el.setAttribute('cx', x);
    packet.el.setAttribute('cy', y);
    packet.ring.setAttribute('cx', x);
    packet.ring.setAttribute('cy', y);
    if (packet.progress >= 1) removePacket(packet);
  }
  packetAccumulator += delta * speed;
  if (packetAccumulator > (mode === 'burst' ? .26 : .58)) {
    packetAccumulator = 0;
    spawnFromTraffic();
  }
}
function updateMetrics() {
  const jitter = mode === 'burst' ? Math.round(Math.random() * 8) : Math.round(Math.random() * 4);
  currentLoad = Math.max(22, Math.min(94, Math.round((mode === 'quiet' ? 35 : mode === 'burst' ? 82 : 61) + jitter)));
  loadFill.style.width = `${currentLoad}%`;
  loadLabel.textContent = `${currentLoad}%`;
  document.querySelector('#credit-fill').style.background = `linear-gradient(90deg, var(--mint-strong) ${Math.max(18, 100 - currentLoad)}%, #183e3a ${Math.max(18, 100 - currentLoad)}%)`;
  document.querySelector('#credits').textContent = `${Math.max(18, 100 - currentLoad)}%`;
  packetCount.textContent = String(activePackets.length).padStart(2, '0');
}
function packetLabel(packet) {
  const name = packet.destination === 'switch' ? 'RC → SW' : packet.origin === 'switch' ? `SW → ${packet.destination.slice(0, 3).toUpperCase()}` : 'RC → SW';
  return { name, kind: packet.reply ? 'CPL · COMPLETION' : packet.burst ? 'MWr · BURST' : 'MRd · REQUEST', size: packet.reply ? '64 B' : packet.burst ? '512 B' : '128 B' };
}
function renderActivity() {
  const visible = [...activePackets].sort((a, b) => b.id - a.id).slice(0, 5);
  packetList.innerHTML = visible.map((packet, index) => {
    const label = packetLabel(packet);
    return `<div class="packet-row" style="animation-delay:${index * 35}ms"><i class="packet-status ${packet.reply ? 'reply' : ''}"></i><div class="packet-text"><b>${label.name}</b><small>${label.kind}</small></div><span class="packet-size">${label.size}</span></div>`;
  }).join('');
  packetCount.textContent = String(activePackets.length).padStart(2, '0');
}
function selectDistrict(key) {
  selectedNode = key;
  document.querySelectorAll('.district').forEach((district) => district.classList.toggle('selected', district.dataset.district === key));
  const node = nodes[key];
  document.querySelector('#inspector-title').textContent = node.title;
  document.querySelector('#inspector-copy').textContent = node.copy;
  document.querySelector('#port-state').textContent = node.state;
  document.querySelector('#link-width').textContent = node.width;
  document.querySelector('#tx-rate').innerHTML = `${node.rate} <small>GT/s</small>`;
  document.querySelector('#latency').innerHTML = `${node.latency} <small>ns</small>`;
  document.querySelector('#address').textContent = node.address;
  document.querySelector('#traffic-class').textContent = node.traffic;
  const activeEl = document.querySelector('#inspector');
  activeEl.animate([{ borderColor: 'rgba(155,231,173,.7)' }, { borderColor: 'rgba(154,218,177,.16)' }], { duration: 650, easing: 'ease-out' });
  if (explorerReady) recordEvidence(`node:${key}`);
}
function updateSpeed(value) {
  speed = Number(value);
  speedLabel.textContent = `${speed.toFixed(1)}×`;
  const percent = ((speed - .5) / 2) * 100;
  speedRange.style.background = `linear-gradient(90deg, var(--mint-strong) ${percent}%, rgba(128, 173, 160, .22) ${percent}%)`;
}
function toggleSimulation() {
  running = !running;
  toggleButton.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
  toggleButton.querySelector('span:last-child').textContent = running ? '暫停模擬' : '繼續模擬';
  toggleButton.classList.toggle('paused', !running);
}
function animate(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) updatePackets(delta);
  if (now - logClock > 700) { renderActivity(); updateMetrics(); logClock = now; }
  requestAnimationFrame(animate);
}

document.querySelectorAll('.district').forEach((district) => {
  district.addEventListener('click', () => selectDistrict(district.dataset.district));
  district.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectDistrict(district.dataset.district); } });
});
document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach((item) => item.classList.toggle('active', item === button));
  if (explorerReady) recordEvidence(`mode:${mode}`);
}));
speedRange.addEventListener('input', (event) => updateSpeed(event.target.value));
toggleButton.addEventListener('click', toggleSimulation);
pulseButton.addEventListener('click', () => {
  const destination = selectedNode === 'root' || selectedNode === 'switch' ? 'gpu' : selectedNode;
  makePacket({ origin: 'switch', destination, burst: true, manual: true });
  selectDistrict(destination);
  renderActivity();
  if (explorerReady) recordEvidence('packet:manual');
});
document.querySelector('#reset-view').addEventListener('click', () => {
  selectDistrict('switch');
  speedRange.value = 1;
  updateSpeed(1);
  mode = 'balanced';
  document.querySelectorAll('.mode-btn').forEach((item) => item.classList.toggle('active', item.dataset.mode === mode));
});

seedPackets();
selectDistrict('switch');
updateSpeed(1);
renderActivity();
requestAnimationFrame(animate);

const questConfig = {
  topology: {
    label: 'GATE 00', name: 'Find the Root', xp: 40, target: 'simulation', targetNode: 'root', targetLabel: '打開 Root Complex',
    objective: '找到 Root Complex，確認它是 CPU／記憶體世界進入 PCIe Fabric 的入口。',
    requirements: [{ id: 'node:root', label: '已查看 Root Complex 節點檢視器' }],
    question: '哪一個角色把 CPU／記憶體世界接進 PCIe Fabric？',
    options: ['Root Complex', 'Switch', 'Endpoint', 'TLP'], answer: 0,
    explanation: 'Root Complex 是 PCIe 拓撲的根，負責把 CPU／記憶體的請求送進 Fabric。'
  },
  transaction: {
    label: 'TLP MARKET', name: 'Deliver a Read', xp: 60, target: 'simulation', targetNode: 'gpu', targetLabel: '查看 GPU Endpoint',
    objective: '選取一個 Endpoint，再主動發送一個 TLP，觀察請求離開 Switch 的方向。',
    requirements: [{ id: 'node:gpu', label: '已查看 GPU Endpoint' }, { id: 'packet:manual', label: '已手動發送一個 TLP' }],
    question: 'Switch 在一筆送往 GPU 的交易中最主要做什麼？',
    options: ['永久保存資料', '依目的地轉送封包', '提供電力', '把 TLP 轉成 HTML'], answer: 1,
    explanation: 'Switch 根據目的地與路由，將 TLP 導向正確的下游 Endpoint。'
  },
  flow: {
    label: 'CREDIT RESERVOIR', name: 'Keep Moving', xp: 70, target: 'control-deck', targetLabel: '前往流量控制台',
    objective: '切到 Burst 模式，觀察 Fabric Load 和 Flow Credits 的反向變化。',
    requirements: [{ id: 'mode:burst', label: '已切換到 Burst 流量模式' }],
    question: 'Flow Credits 的主要目的為何？',
    options: ['增加 Lane 數量', '避免接收端被封包淹沒', '保存 Completion', '替裝置供電'], answer: 1,
    explanation: 'Credit-based flow control 讓傳送端只在接收端有可用緩衝空間時繼續送資料。'
  },
  link: {
    label: 'REPLAY DOCK', name: 'Read the Receipt', xp: 55, target: 'activity', targetNode: 'storage', targetLabel: '查看 NVMe 與流量',
    objective: '查看 NVMe Endpoint 與 Packet Stream，辨識讀取請求需要哪一種回覆。',
    requirements: [{ id: 'node:storage', label: '已查看 NVMe Storage 節點' }],
    question: '裝置收到 Non-Posted Read Request 後，通常用什麼送回結果？',
    options: ['Completion', 'Lane', 'Link Width', 'Root Complex'], answer: 0,
    explanation: 'Completion 是對 Non-Posted Request 的回覆封包，會把讀取結果送回請求端。'
  },
  physical: {
    label: 'EQUALIZATION SUMMIT', name: 'Climb the Layers', xp: 65, target: 'simulation', targetNode: 'switch', targetLabel: '查看 x16 主幹',
    objective: '查看 Switch 的 Link Width，分辨 Lane 數與 PCIe 世代的不同。',
    requirements: [{ id: 'node:switch', label: '已查看 Fabric Switch 的 Link Width' }],
    question: 'Link Width 寫成 x8，最直接代表什麼？',
    options: ['第 8 代 PCIe', '8 個 Endpoint', '8 條 Lane', '8 bytes 封包'], answer: 2,
    explanation: 'x 後面的數字是該 Link 使用的 Lane 數；PCIe 世代則由 Gen 表示。'
  },
  systems: {
    label: 'ERROR OBSERVATORY', name: 'Stay Online', xp: 90, target: 'quiz', targetLabel: '完成知識測驗',
    objective: '以滿分完成五題基礎測驗，將角色、封包、通道與回覆串成一條路徑。',
    requirements: [{ id: 'quiz:mastery', label: '已以 5／5 完成基礎測驗' }],
    question: '下列哪個順序最接近一次 PCIe 讀取交易？',
    options: ['Endpoint → TLP → Switch → CPU', 'Root Complex → Switch → Endpoint → Completion', 'Lane → Completion → Switch → Root Complex', 'Switch → Root Complex → Lane → Endpoint'], answer: 1,
    explanation: '一筆讀取交易由 Root Complex 發起，經 Switch 導向 Endpoint，再以 Completion 回覆。'
  }
};

const quizQuestions = [
  { question: '如果把 PCIe 想成城市，誰最像「市政廳」？', options: ['Root Complex', 'Switch', 'Endpoint', 'TLP'], answer: 0, explanation: 'Root Complex 是 PCIe 拓撲的根，負責把 CPU／記憶體世界接進這座城市。' },
  { question: 'Link Width 寫成 x8，最直接代表什麼？', options: ['速度是第 8 代', '這條 Link 有 8 條 Lane', '有 8 個 Endpoint', '封包大小是 8 bytes'], answer: 1, explanation: 'x 後面的數字是 Lane 數量；x8 就是 8 條獨立的傳送與接收通道。' },
  { question: 'Switch 在 PCIe 城市裡最主要的工作是什麼？', options: ['把資料永久儲存起來', '替每個裝置產生電力', '依目的地把封包轉送到正確路徑', '把 TLP 翻譯成 HTML'], answer: 2, explanation: 'Switch 會看封包的目的地，將流量分送到正確的下游 Endpoint。' },
  { question: 'TLP 最接近下面哪一種描述？', options: ['一棟 PCIe 建築物', '一條實體 Lane', '帶有交易資訊的封包', '一個作業系統程序'], answer: 2, explanation: 'TLP 是 Transaction Layer Packet，裡面放著讀取、寫入或回覆等交易資訊。' },
  { question: '裝置收到讀取請求後，通常用什麼回覆結果？', options: ['Completion', 'Lane', 'Root Complex', 'Link Width'], answer: 0, explanation: 'Completion 是對 Non-Posted Request 的回覆，會把讀取結果送回請求方。' }
];

const scenarioConfig = [
  {
    title: '協商後的鏈路', context: '一張擴充卡雖然支援 Gen3 x16，但目前沒有跑在最高能力。',
    output: 'LnkCap: Speed 8GT/s, Width x16\nLnkSta: Speed 2.5GT/s, Width x1',
    question: '哪一行描述目前實際協商後的連線？',
    options: ['LnkCap：可支援的能力', 'LnkSta：目前的狀態'], answer: 1,
    explanation: 'LnkCap 是能力上限；LnkSta 顯示目前協商出的速度與寬度。本案例目前是 2.5GT/s、x1。'
  },
  {
    title: '讀取的回執', context: 'Root Complex 向 NVMe 讀取資料；請求送達後，資料必須回到發起端。',
    output: 'RC → SW   MRd · REQUEST\nSW → NVMe MRd · REQUEST\nNVMe → RC CPL · COMPLETION',
    question: '哪一個封包攜帶讀取結果回覆請求端？',
    options: ['MRd · REQUEST', 'CPL · COMPLETION'], answer: 1,
    explanation: 'MRd 提出讀取要求；Completion 則帶回對 Non-Posted Request 的回覆。'
  },
  {
    title: '錯誤訊號的位置', context: '系統需要開始調查 PCIe 錯誤，而不是調整動畫控制台。',
    output: 'Capabilities: [100] Advanced Error Reporting\nCESta: Receiver Error',
    question: '下一步最可靠的方向是什麼？',
    options: ['查看 AER 狀態與系統記錄', '提高模擬速度'], answer: 0,
    explanation: 'AER 是 PCIe 的錯誤回報能力；實務調查應對照 AER 狀態、核心日誌與裝置／鏈路狀態。'
  }
];

const explorerStorageKey = 'learning-city-pcie-explorer-v2';
const defaultExplorerState = {
  xp: 0, completed: [], activeQuest: 'topology', evidence: {}, proofAnswers: {}, reviews: [],
  quiz: { index: 0, answers: {}, bestScore: 0, mastered: false }, scenarioAnswers: {}
};
let explorerState = loadExplorerState();

function loadExplorerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(explorerStorageKey));
    if (saved && typeof saved === 'object') {
      return {
        ...defaultExplorerState, ...saved,
        quiz: { ...defaultExplorerState.quiz, ...saved.quiz },
        evidence: saved.evidence || {}, proofAnswers: saved.proofAnswers || {},
        reviews: Array.isArray(saved.reviews) ? saved.reviews : [],
        completed: Array.isArray(saved.completed) ? saved.completed : [],
        scenarioAnswers: saved.scenarioAnswers || {}
      };
    }
  } catch (error) {
    // Private browsing and file:// can deny storage; the session still works.
  }
  return structuredClone(defaultExplorerState);
}
function saveExplorerState() {
  try { localStorage.setItem(explorerStorageKey, JSON.stringify(explorerState)); } catch (error) { /* no-op fallback */ }
}
function addReview(id, title, note) {
  if (!explorerState.reviews.some((review) => review.id === id)) explorerState.reviews.push({ id, title, note });
}
function awardXp(amount) {
  explorerState.xp = Math.min(500, explorerState.xp + amount);
}
function renderExplorer() {
  const level = Math.floor(explorerState.xp / 100) + 1;
  const rank = level >= 5 ? 'FABRIC GUARDIAN' : level >= 3 ? 'LINK RANGER' : 'FABRIC SCOUT';
  document.querySelector('#player-level').textContent = String(level).padStart(2, '0');
  document.querySelector('#player-rank').textContent = rank;
  document.querySelector('#player-xp').textContent = `${explorerState.xp} / 500 XP`;
  document.querySelector('#xp-fill').style.width = `${Math.min(100, explorerState.xp % 100)}%`;
  document.querySelector('#quest-complete-count').textContent = `${explorerState.completed.length} / 6 QUESTS`;
  document.querySelector('#badge-count').textContent = String(explorerState.completed.length).padStart(2, '0');
  document.querySelector('#review-count').textContent = String(explorerState.reviews.length).padStart(2, '0');
  const active = questConfig[explorerState.activeQuest];
  document.querySelector('#active-quest-label').textContent = active.label;
  document.querySelector('#active-quest-name').textContent = active.name;
  document.querySelectorAll('.quest-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.quest === explorerState.activeQuest);
    const done = explorerState.completed.includes(card.dataset.quest);
    const status = card.querySelector('.quest-status');
    card.classList.toggle('completed', done);
    status.classList.toggle('complete', done);
    status.textContent = done ? 'CLEARED' : card.dataset.quest === explorerState.activeQuest ? 'IN PROGRESS' : 'AVAILABLE';
  });
  document.querySelectorAll('.quest-node').forEach((node) => {
    const id = [...node.classList].find((name) => name.startsWith('node-'))?.replace('node-', '');
    node.classList.toggle('visited', explorerState.completed.includes(id));
    node.classList.toggle('active', id === explorerState.activeQuest);
  });
}
function focusQuest(id, scroll = true) {
  if (!questConfig[id]) return;
  explorerState.activeQuest = id;
  saveExplorerState();
  document.querySelectorAll('.quest-card').forEach((card) => card.classList.toggle('selected', card.dataset.quest === id));
  renderExplorer();
  renderMissionProof();
  if (scroll) document.querySelector('#mission-proof')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function recordEvidence(id) {
  const quest = explorerState.activeQuest;
  const config = questConfig[quest];
  if (!config?.requirements.some((requirement) => requirement.id === id)) return;
  explorerState.evidence[quest] = { ...(explorerState.evidence[quest] || {}), [id]: true };
  saveExplorerState();
  renderMissionProof();
}
function missionReady(id) {
  const config = questConfig[id];
  const evidence = explorerState.evidence[id] || {};
  return config.requirements.every((requirement) => evidence[requirement.id]) && explorerState.proofAnswers[id] === config.answer;
}
function renderMissionProof() {
  const id = explorerState.activeQuest;
  const config = questConfig[id];
  const evidence = explorerState.evidence[id] || {};
  const answered = explorerState.proofAnswers[id];
  const done = explorerState.completed.includes(id);
  const ready = missionReady(id);
  document.querySelector('#mission-code').textContent = config.label;
  document.querySelector('#mission-title').textContent = config.name;
  document.querySelector('#mission-objective').textContent = config.objective;
  document.querySelector('#mission-target').innerHTML = `${config.targetLabel} <span>→</span>`;
  document.querySelector('#mission-evidence').innerHTML = config.requirements.map((requirement) => `<li class="${evidence[requirement.id] ? 'done' : ''}">${requirement.label}</li>`).join('');
  document.querySelector('#mission-question').textContent = config.question;
  document.querySelector('#mission-options').innerHTML = config.options.map((option, index) => {
    const selected = answered === index;
    const state = answered === config.answer && index === config.answer ? ' correct' : selected ? ' incorrect' : '';
    return `<button class="mission-option${state}" data-mission-answer="${index}" type="button"${answered === config.answer ? ' disabled' : ''}>${String.fromCharCode(65 + index)} · ${option}</button>`;
  }).join('');
  const feedback = document.querySelector('#mission-feedback');
  feedback.className = 'mission-feedback';
  feedback.textContent = answered === undefined ? '先完成觀察，再用出口題驗證你的判斷。' : `${answered === config.answer ? '判斷正確。' : '這次不對；請回到觀察點確認。'} ${config.explanation}`;
  if (answered !== undefined) feedback.classList.add(answered === config.answer ? 'correct' : 'incorrect');
  const state = document.querySelector('#mission-state');
  state.className = `mission-state ${done ? 'complete' : ready ? 'ready' : ''}`;
  state.textContent = done ? '已驗證' : ready ? '可完成' : '蒐集證據中';
  const complete = document.querySelector('#mission-complete');
  complete.disabled = done || !ready;
  complete.innerHTML = done ? '任務已驗證 <span>✓</span>' : ready ? `驗證並領取 +${config.xp} XP <span>→</span>` : '證據不足 <span>→</span>';
  document.querySelectorAll('.mission-option').forEach((button) => button.addEventListener('click', () => answerMission(id, Number(button.dataset.missionAnswer))));
}
function answerMission(id, answer) {
  const config = questConfig[id];
  explorerState.proofAnswers[id] = answer;
  if (answer !== config.answer) addReview(`quest:${id}`, config.name, config.explanation);
  saveExplorerState();
  renderExplorer();
  renderMissionProof();
}
function completeMission() {
  const id = explorerState.activeQuest;
  if (!missionReady(id) || explorerState.completed.includes(id)) return;
  explorerState.completed.push(id);
  awardXp(questConfig[id].xp);
  saveExplorerState();
  renderExplorer();
  renderMissionProof();
}
function goToMissionTarget() {
  const config = questConfig[explorerState.activeQuest];
  if (config.targetNode) selectDistrict(config.targetNode);
  document.querySelector(`#${config.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function quizScore() {
  return Object.entries(explorerState.quiz.answers).reduce((score, [index, answer]) => score + (quizQuestions[Number(index)].answer === answer ? 1 : 0), 0);
}
function renderQuiz() {
  const { index, answers } = explorerState.quiz;
  const question = quizQuestions[index];
  const answer = answers[index];
  const score = quizScore();
  document.querySelector('#quiz-count').textContent = `QUESTION ${String(index + 1).padStart(2, '0')} / ${quizQuestions.length}`;
  document.querySelector('#quiz-progress-fill').style.width = `${((index + 1) / quizQuestions.length) * 100}%`;
  document.querySelector('#quiz-score').textContent = `${score} / ${quizQuestions.length}`;
  document.querySelector('#quiz-question').textContent = question.question;
  document.querySelector('#quiz-options').innerHTML = question.options.map((option, optionIndex) => {
    const state = answer === question.answer && optionIndex === question.answer ? ' correct' : answer === optionIndex ? ' incorrect' : '';
    return `<button class="quiz-option${state}" data-answer="${optionIndex}" type="button"${answer !== undefined ? ' disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span> ${option}</button>`;
  }).join('');
  const feedback = document.querySelector('#quiz-feedback');
  feedback.className = 'quiz-feedback';
  feedback.textContent = answer === undefined ? '' : `${answer === question.answer ? '答對了。' : '再想一下。'} ${question.explanation}`;
  if (answer !== undefined) feedback.classList.add(answer === question.answer ? 'correct' : 'incorrect');
  const next = document.querySelector('#quiz-next');
  next.disabled = answer === undefined;
  next.innerHTML = index === quizQuestions.length - 1 ? '儲存本次結果 <span>→</span>' : '下一題 <span>→</span>';
  document.querySelectorAll('.quiz-option').forEach((option) => option.addEventListener('click', () => answerQuiz(Number(option.dataset.answer))));
}
function answerQuiz(answer) {
  const { index, answers } = explorerState.quiz;
  if (answers[index] !== undefined) return;
  const question = quizQuestions[index];
  explorerState.quiz.answers[index] = answer;
  if (answer !== question.answer) addReview(`quiz:${index}`, question.question, question.explanation);
  const score = quizScore();
  explorerState.quiz.bestScore = Math.max(explorerState.quiz.bestScore, score);
  if (index === quizQuestions.length - 1 && score === quizQuestions.length) {
    recordEvidence('quiz:mastery');
    if (!explorerState.quiz.mastered) {
      explorerState.quiz.mastered = true;
      awardXp(125);
    }
  }
  saveExplorerState();
  renderExplorer();
  renderQuiz();
}
function advanceQuiz() {
  const { index, answers } = explorerState.quiz;
  if (answers[index] === undefined) return;
  if (index === quizQuestions.length - 1) explorerState.quiz = { ...explorerState.quiz, index: 0, answers: {} };
  else explorerState.quiz.index += 1;
  saveExplorerState();
  renderQuiz();
}
function renderScenarios() {
  const answers = explorerState.scenarioAnswers;
  document.querySelector('#scenario-grid').innerHTML = scenarioConfig.map((scenario, index) => {
    const answer = answers[index];
    const feedback = answer === undefined ? '' : `${answer === scenario.answer ? '判讀正確。' : '再檢查輸出。'} ${scenario.explanation}`;
    return `<article class="scenario-card"><span class="scenario-kicker">CASE ${String(index + 1).padStart(2, '0')}</span><h3>${scenario.title}</h3><p>${scenario.context}</p><pre>${scenario.output}</pre><p>${scenario.question}</p><div class="scenario-options">${scenario.options.map((option, optionIndex) => `<button class="scenario-option${answer === scenario.answer && optionIndex === scenario.answer ? ' correct' : answer === optionIndex ? ' incorrect' : ''}" data-scenario="${index}" data-scenario-answer="${optionIndex}" type="button"${answer !== undefined ? ' disabled' : ''}>${String.fromCharCode(65 + optionIndex)} · ${option}</button>`).join('')}</div><p class="scenario-feedback">${feedback}</p></article>`;
  }).join('');
  document.querySelectorAll('.scenario-option').forEach((button) => button.addEventListener('click', () => answerScenario(Number(button.dataset.scenario), Number(button.dataset.scenarioAnswer))));
}
function answerScenario(index, answer) {
  const scenario = scenarioConfig[index];
  explorerState.scenarioAnswers[index] = answer;
  if (answer !== scenario.answer) addReview(`scenario:${index}`, scenario.title, scenario.explanation);
  saveExplorerState();
  renderExplorer();
  renderScenarios();
}

document.querySelectorAll('.term-filter').forEach((filterButton) => filterButton.addEventListener('click', () => {
  const filter = filterButton.dataset.filter;
  document.querySelectorAll('.term-filter').forEach((button) => button.classList.toggle('active', button === filterButton));
  document.querySelectorAll('.term-card').forEach((card) => card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter));
}));
document.querySelectorAll('.lesson-jump').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(`#${button.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelectorAll('.term-jump').forEach((button) => button.addEventListener('click', () => {
  selectDistrict(button.dataset.node);
  document.querySelector('#simulation').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (button.textContent.includes('TLP')) pulseButton.click();
}));
document.querySelectorAll('.quest-action').forEach((button) => button.addEventListener('click', () => focusQuest(button.dataset.questAction)));
document.querySelectorAll('.quest-card').forEach((card) => card.addEventListener('click', (event) => {
  if (!event.target.closest('.quest-action')) focusQuest(card.dataset.quest, false);
}));
document.querySelector('#mission-target').addEventListener('click', goToMissionTarget);
document.querySelector('#mission-complete').addEventListener('click', completeMission);
document.querySelector('#quiz-next').addEventListener('click', advanceQuiz);

explorerReady = true;
renderExplorer();
renderMissionProof();
renderQuiz();
renderScenarios();
