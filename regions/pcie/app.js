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
}));
speedRange.addEventListener('input', (event) => updateSpeed(event.target.value));
toggleButton.addEventListener('click', toggleSimulation);
pulseButton.addEventListener('click', () => {
  const destination = selectedNode === 'root' || selectedNode === 'switch' ? 'gpu' : selectedNode;
  makePacket({ origin: 'switch', destination, burst: true, manual: true });
  selectDistrict(destination);
  renderActivity();
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

const quizQuestions = [
  {
    question: '如果把 PCIe 想成城市，誰最像「市政廳」？',
    options: ['Root Complex', 'Switch', 'Endpoint', 'TLP'],
    answer: 0,
    explanation: 'Root Complex 是 PCIe 拓撲的根，負責把 CPU / 記憶體世界接進這座城市。'
  },
  {
    question: 'Link Width 寫成 x8，最直接代表什麼？',
    options: ['速度是第 8 代', '這條 Link 有 8 條 Lane', '有 8 個 Endpoint', '封包大小是 8 bytes'],
    answer: 1,
    explanation: 'x 後面的數字是 Lane 數量；x8 就是 8 條獨立的傳送與接收通道。'
  },
  {
    question: 'Switch 在 PCIe 城市裡最主要的工作是什麼？',
    options: ['把資料永久儲存起來', '替每個裝置產生電力', '依目的地把封包轉送到正確路徑', '把 TLP 翻譯成 HTML'],
    answer: 2,
    explanation: 'Switch 會看封包的目的地，將流量分送到正確的下游 Endpoint。'
  },
  {
    question: 'TLP 最接近下面哪一種描述？',
    options: ['一棟 PCIe 建築物', '一條實體 Lane', '帶有交易資訊的封包', '一個作業系統程序'],
    answer: 2,
    explanation: 'TLP 是 Transaction Layer Packet，裡面放著讀取、寫入或回覆等交易資訊。'
  },
  {
    question: '裝置收到讀取請求後，通常用什麼回覆結果？',
    options: ['Completion', 'Lane', 'Root Complex', 'Link Width'],
    answer: 0,
    explanation: 'Completion 是對 Non-Posted Request 的回覆，會把讀取結果送回請求方。'
  }
];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

function renderQuiz() {
  const question = quizQuestions[quizIndex];
  quizAnswered = false;
  document.querySelector('#quiz-count').textContent = `QUESTION ${String(quizIndex + 1).padStart(2, '0')} / ${quizQuestions.length}`;
  document.querySelector('#quiz-progress-fill').style.width = `${((quizIndex + 1) / quizQuestions.length) * 100}%`;
  document.querySelector('#quiz-score').textContent = `${quizScore} / ${quizQuestions.length}`;
  document.querySelector('#quiz-question').textContent = question.question;
  document.querySelector('#quiz-feedback').textContent = '';
  document.querySelector('#quiz-feedback').className = 'quiz-feedback';
  const nextButton = document.querySelector('#quiz-next');
  nextButton.disabled = true;
  nextButton.innerHTML = '選好答案 <span>→</span>';
  document.querySelector('#quiz-options').innerHTML = question.options.map((option, index) => `<button class="quiz-option" data-answer="${index}" type="button"><span class="option-letter">${String.fromCharCode(65 + index)}</span> ${option}</button>`).join('');
  document.querySelectorAll('.quiz-option').forEach((option) => option.addEventListener('click', () => answerQuiz(Number(option.dataset.answer))));
}
function answerQuiz(answer) {
  if (quizAnswered) return;
  quizAnswered = true;
  const question = quizQuestions[quizIndex];
  const correct = answer === question.answer;
  if (correct) {
    quizScore += 1;
    if (!explorerState.quizAwards.includes(quizIndex)) {
      explorerState.quizAwards.push(quizIndex);
      awardXp(25);
    }
  }
  document.querySelectorAll('.quiz-option').forEach((option) => {
    const optionAnswer = Number(option.dataset.answer);
    option.disabled = true;
    if (optionAnswer === question.answer) option.classList.add('correct');
    if (optionAnswer === answer && !correct) option.classList.add('incorrect');
  });
  const feedback = document.querySelector('#quiz-feedback');
  feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
  feedback.textContent = `${correct ? '答對了。' : '再想一下。'} ${question.explanation}`;
  document.querySelector('#quiz-score').textContent = `${quizScore} / ${quizQuestions.length}`;
  const nextButton = document.querySelector('#quiz-next');
  nextButton.disabled = false;
  nextButton.innerHTML = quizIndex === quizQuestions.length - 1 ? '看結果 <span>→</span>' : '下一題 <span>→</span>';
}
document.querySelector('#quiz-next').addEventListener('click', () => {
  if (!quizAnswered) return;
  if (quizIndex === quizQuestions.length - 1) {
    quizIndex = 0;
    quizScore = 0;
  } else {
    quizIndex += 1;
  }
  renderQuiz();
});
document.querySelectorAll('.term-filter').forEach((filterButton) => filterButton.addEventListener('click', () => {
  const filter = filterButton.dataset.filter;
  document.querySelectorAll('.term-filter').forEach((button) => button.classList.toggle('active', button === filterButton));
  document.querySelectorAll('.term-card').forEach((card) => card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter));
}));
document.querySelectorAll('.lesson-jump').forEach((button) => button.addEventListener('click', () => {
  const target = document.querySelector(`#${button.dataset.target}`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelectorAll('.term-jump').forEach((button) => button.addEventListener('click', () => {
  selectDistrict(button.dataset.node);
  document.querySelector('#simulation').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (button.textContent.includes('TLP')) pulseButton.click();
}));
renderQuiz();

const questConfig = {
  topology: { label: 'GATE 00', name: 'Find the Root', target: 'simulation', node: 'root', xp: 40 },
  transaction: { label: 'TLP MARKET', name: 'Deliver a Read', target: 'simulation', node: 'gpu', xp: 60, pulse: true },
  flow: { label: 'CREDIT RESERVOIR', name: 'Keep Moving', target: 'control-deck', mode: 'burst', xp: 70 },
  link: { label: 'REPLAY DOCK', name: 'Read the Receipt', target: 'activity', node: 'storage', xp: 55 },
  physical: { label: 'EQUALIZATION SUMMIT', name: 'Climb the Layers', target: 'concepts', node: 'switch', xp: 65 },
  systems: { label: 'ERROR OBSERVATORY', name: 'Stay Online', target: 'quiz', xp: 90 }
};
const explorerStorageKey = 'learning-city-pcie-explorer-v1';
let explorerState = { xp: 120, visited: [], quizAwards: [], activeQuest: 'topology' };

function loadExplorerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(explorerStorageKey));
    if (saved && typeof saved === 'object') return { ...explorerState, ...saved };
  } catch (error) {
    // Private browsing and file:// can deny storage; the session still works.
  }
  return explorerState;
}
function saveExplorerState() {
  try { localStorage.setItem(explorerStorageKey, JSON.stringify(explorerState)); } catch (error) { /* no-op fallback */ }
}
function renderExplorer() {
  const level = Math.floor(explorerState.xp / 100) + 1;
  const rank = level >= 5 ? 'FABRIC GUARDIAN' : level >= 3 ? 'LINK RANGER' : 'FABRIC SCOUT';
  const levelXp = explorerState.xp % 100;
  document.querySelector('#player-level').textContent = String(level).padStart(2, '0');
  document.querySelector('#player-rank').textContent = rank;
  document.querySelector('#player-xp').textContent = `${explorerState.xp} / 500 XP`;
  document.querySelector('#xp-fill').style.width = `${Math.min(100, levelXp)}%`;
  document.querySelector('#quest-complete-count').textContent = `${explorerState.visited.length} / 6 QUESTS`;
  document.querySelector('#badge-count').textContent = String(explorerState.visited.length + 1).padStart(2, '0');
  const active = questConfig[explorerState.activeQuest];
  document.querySelector('#active-quest-label').textContent = active.label;
  document.querySelector('#active-quest-name').textContent = active.name;
  document.querySelectorAll('.quest-card').forEach((card) => {
    const done = explorerState.visited.includes(card.dataset.quest);
    const status = card.querySelector('.quest-status');
    card.classList.toggle('completed', done);
    status.classList.toggle('complete', done);
    status.textContent = done ? 'CLEARED' : card.dataset.quest === explorerState.activeQuest ? 'NEXT' : 'AVAILABLE';
  });
  document.querySelectorAll('.quest-node').forEach((node) => {
    const id = [...node.classList].find((name) => name.startsWith('node-'))?.replace('node-', '');
    node.classList.toggle('visited', explorerState.visited.includes(id));
    node.classList.toggle('active', id === explorerState.activeQuest);
  });
}
function awardXp(amount) {
  explorerState.xp = Math.min(500, explorerState.xp + amount);
  saveExplorerState();
  renderExplorer();
}
function focusQuest(id, scroll = true) {
  const config = questConfig[id];
  if (!config) return;
  explorerState.activeQuest = id;
  document.querySelectorAll('.quest-card').forEach((card) => card.classList.toggle('selected', card.dataset.quest === id));
  renderExplorer();
  if (config.node) selectDistrict(config.node);
  if (config.mode) document.querySelector(`[data-mode="${config.mode}"]`)?.click();
  if (config.pulse) pulseButton.click();
  if (scroll) document.querySelector(`#${config.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function discoverQuest(id) {
  if (!explorerState.visited.includes(id)) {
    explorerState.visited.push(id);
    awardXp(questConfig[id].xp);
  }
  saveExplorerState();
  focusQuest(id);
}
document.querySelectorAll('.quest-action').forEach((button) => button.addEventListener('click', () => discoverQuest(button.dataset.questAction)));
document.querySelectorAll('.quest-card').forEach((card) => card.addEventListener('click', (event) => {
  if (event.target.closest('.quest-action')) return;
  focusQuest(card.dataset.quest, false);
}));
explorerState = loadExplorerState();
renderExplorer();
focusQuest(explorerState.activeQuest, false);
