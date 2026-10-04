const action = document.querySelector('#action');
const reset = document.querySelector('#reset');
const status = document.querySelector('#status');
let interactions = 0;

function draw() {
  status.textContent = interactions === 0
    ? 'Ready.'
    : `Interaction ${interactions} recorded. Replace this behavior with your own.`;
}

action.addEventListener('click', () => {
  interactions += 1;
  draw();
});

reset.addEventListener('click', () => {
  interactions = 0;
  draw();
});
