/* Orb Runner — vanilla JS, no libraries
   Systems: input, physics, collisions, spawning, levels, HUD, pause, game over
*/
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hud = {
  score: document.getElementById('score'),
  level: document.getElementById('level'),
  lives: document.getElementById('lives'),
};
const overlay = document.getElementById('overlay');
const gameover = document.getElementById('gameover');
const finalScoreEl = document.getElementById('finalScore');
document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnRetry').addEventListener('click', startGame);
document.getElementById('btnHome').addEventListener('click', () => {
  gameover.classList.remove('show'); overlay.classList.add('show');
});

const W = canvas.width, H = canvas.height;

// ------------ Utilities
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (min, max) => Math.random() * (max - min) + min;
const dist2 = (a,b) => { const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; };

// ------------ Input
const keys = new Set();
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'p') togglePause();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ------------ Entities
class Player {
  constructor(){
    this.x = W*0.2; this.y = H*0.5;
    this.r = 10; this.speed = 2.8; this.vx = 0; this.vy = 0;
    this.invuln = 0; // frames remaining
  }
  update(dt, slowFactor){
    const ax = (keys.has('arrowright')||keys.has('d')) - (keys.has('arrowleft')||keys.has('a'));
    const ay = (keys.has('arrowdown') ||keys.has('s')) - (keys.has('arrowup')  ||keys.has('w'));
    const accel = 0.35 * (slowFactor || 1);
    this.vx = clamp(this.vx + ax*accel, -this.speed, this.speed);
    this.vy = clamp(this.vy + ay*accel, -this.speed, this.speed);
    this.x = clamp(this.x + this.vx, this.r, W - this.r);
    this.y = clamp(this.y + this.vy, this.r, H - this.r);
    this.vx *= 0.92; this.vy *= 0.92;
    if (this.invuln>0) this.invuln--;
  }
  hit(){ if (this.invuln<=0){ state.lives--; this.invuln = 90; } }
  draw(){
    ctx.save();
    const glow = this.invuln>0 ? '#88ffd9' : '#5aa9ff';
    ctx.shadowColor = glow; ctx.shadowBlur = 18;
    ctx.fillStyle = this.invuln>0 ? '#6fffd3' : '#5aa9ff';
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

class Orb {
  constructor(){
    // spawn away from player
    do {
      this.x = rand(40, W-40); this.y = rand(40, H-40);
    } while (Math.hypot(this.x-state.player.x, this.y-state.player.y) < 100);
    this.r = 7;
    this.t = 0; // for pulsing
  }
  update(dt){ this.t += dt; }
  draw(){
    const pulse = 0.6 + 0.4*Math.sin(this.t*6);
    ctx.save();
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 15*pulse;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

class Hazard {
  constructor(level){
    // spawn from right edge, fly left; speed scales with level
    this.r = rand(8, 14);
    this.x = W + this.r + rand(0, 120);
    this.y = rand(this.r, H - this.r);
    const base = 1.5 + level*0.15;
    this.vx = -rand(base, base+1.3);
    this.vy = rand(-0.5, 0.5);
    this.color = '#ff6363';
  }
  update(){ this.x += this.vx; this.y = clamp(this.y + this.vy, this.r, H-this.r); }
  offscreen(){ return this.x < -this.r; }
  draw(){
    ctx.save();
    ctx.fillStyle = this.color; ctx.shadowColor=this.color; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

class PowerUp {
  constructor(type='slow'){
    this.type = type; this.r = 9;
    this.x = rand(30, W-30); this.y = rand(30, H-30);
    this.ttl = 10 * 60; // frames (10s)
  }
  update(){ this.ttl--; }
  expired(){ return this.ttl<=0; }
  draw(){
    ctx.save();
    const c = this.type==='slow' ? '#7afcff' : '#baffc9';
    ctx.fillStyle=c; ctx.shadowColor=c; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.rect(this.x-this.r, this.y-this.r, this.r*2, this.r*2);
    ctx.fill(); ctx.restore();
  }
}

// ------------ Game State
const state = {
  running: false,
  paused: false,
  player: null,
  orbs: [],
  hazards: [],
  powerups: [],
  score: 0,
  level: 1,
  lives: 3,
  spawnHazardEvery: 90, // frames
  spawnOrbEvery: 180,
  spawnPowEvery: 900,
  slowTimer: 0, // frames of slow motion
  frame: 0,
  lastTime: 0,
  raf: 0
};

function reset(){
  state.running = true; state.paused = false;
  state.player = new Player();
  state.orbs = [new Orb()];
  state.hazards = [];
  state.powerups = [];
  state.score = 0; state.level = 1; state.lives = 3;
  state.spawnHazardEvery = 90; state.spawnOrbEvery = 180; state.spawnPowEvery = 900;
  state.slowTimer = 0; state.frame = 0;
  overlay.classList.remove('show'); gameover.classList.remove('show');
  updateHud();
}

function startGame(){
  reset();
  cancelAnimationFrame(state.raf);
  state.lastTime = performance.now();
  loop(state.lastTime);
}

function togglePause(){
  if (!state.running) return;
  state.paused = !state.paused;
  if (!state.paused) {
    state.lastTime = performance.now();
    loop(state.lastTime);
  }
}

function updateHud(){
  hud.score.textContent = state.score;
  hud.level.textContent = state.level;
  hud.lives.textContent = state.lives;
}

function endGame(){
  state.running = false;
  finalScoreEl.textContent = state.score.toString();
  gameover.classList.add('show');
}

// ------------ Main Loop
function loop(now){
  if (!state.running) return;
  state.raf = requestAnimationFrame(loop);
  if (state.paused) return;

  const dt = Math.min(32, now - state.lastTime) / 1000; // seconds
  state.lastTime = now;
  step(dt);
  draw();
}

function step(dt){
  state.frame++;

  // Difficulty scaling
  if (state.frame % 600 === 0){ // every ~10s at 60fps
    state.level++;
    state.spawnHazardEvery = Math.max(40, state.spawnHazardEvery - 6);
    state.spawnOrbEvery = Math.max(100, state.spawnOrbEvery - 4);
  }

  // Spawning
  if (state.frame % state.spawnOrbEvery === 0) state.orbs.push(new Orb());
  if (state.frame % state.spawnHazardEvery === 0) state.hazards.push(new Hazard(state.level));
  if (state.frame % state.spawnPowEvery === 0) state.powerups.push(new PowerUp('slow'));

  // Update player with optional slow-motion factor
  const slowFactor = state.slowTimer>0 ? 0.6 : 1;
  state.player.update(dt, slowFactor);
  if (state.slowTimer>0) state.slowTimer--;

  // Update orbs & collisions
  for (let i = state.orbs.length-1; i>=0; i--){
    const o = state.orbs[i]; o.update(dt);
    if (dist2(state.player, o) < (state.player.r + o.r)**2){
      state.orbs.splice(i,1);
      state.score += 10;
      updateHud();
    }
  }
  // Update power-ups
  for (let i = state.powerups.length-1; i>=0; i--){
    const p = state.powerups[i]; p.update();
    if (p.expired()) { state.powerups.splice(i,1); continue; }
    if (dist2(state.player, p) < (state.player.r + p.r)**2){
      if (p.type==='slow') state.slowTimer = 6 * 60; // 6s slow-mo
      state.powerups.splice(i,1);
    }
  }
  // Hazards
  for (let i = state.hazards.length-1; i>=0; i--){
    const h = state.hazards[i];
    h.update();
    if (h.offscreen()) { state.hazards.splice(i,1); continue; }
    if (dist2(state.player, h) < (state.player.r + h.r)**2){
      state.player.hit();
      if (state.lives<=0) { endGame(); return; }
      updateHud();
      // knock back a little
      state.player.vx = -Math.sign(h.vx) * 3;
      state.player.vy += (Math.random()>.5 ? 1 : -1) * 2;
    }
  }
}

function draw(){
  // Clear
  ctx.clearRect(0,0,W,H);

  // Arena border
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1,1,W-2,H-2);

  // Draw entities
  state.orbs.forEach(o => o.draw());
  state.powerups.forEach(p => p.draw());
  state.hazards.forEach(h => h.draw());
  state.player.draw();

  // Slow effect vignette
  if (state.slowTimer>0){
    ctx.fillStyle = 'rgba(122,252,255,0.06)';
    ctx.fillRect(0,0,W,H);
  }
}
