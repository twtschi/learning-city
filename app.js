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
