const minutes = document.querySelector('#minutes');
const clock = document.querySelector('#clock');
const toggle = document.querySelector('#toggle');
const status = document.querySelector('#status');
let remaining = 300000;
let deadline = 0;
let interval;
function draw() {
  const seconds = Math.ceil(remaining / 1000);
  clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function pause() {
  clearInterval(interval);
  interval = undefined;
  minutes.disabled = false;
  toggle.textContent = 'Resume';
}
function reset() {
  pause();
  const value = Math.min(180, Math.max(1, Math.round(Number(minutes.value) || 5)));
  minutes.value = value;
  remaining = value * 60000;
  toggle.textContent = 'Start focus';
  status.textContent = 'Ready when you are.';
  draw();
}
toggle.addEventListener('click', () => {
  if (interval) {
    remaining = Math.max(0, deadline - Date.now());
    pause(); draw(); status.textContent = 'Paused. Take your time.';
    return;
  }
  if (remaining <= 0) reset();
  deadline = Date.now() + remaining;
  minutes.disabled = true;
  toggle.textContent = 'Pause';
  status.textContent = 'Focus on your next small step.';
  interval = setInterval(() => {
    remaining = Math.max(0, deadline - Date.now());
    draw();
    if (!remaining) { pause(); toggle.textContent = 'Start again'; status.textContent = 'Session complete. Nice work.'; }
  }, 200);
});
minutes.addEventListener('change', reset);
document.querySelector('#reset').addEventListener('click', reset);
