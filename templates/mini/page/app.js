document.querySelector('#idea').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = document.querySelector('#headline').value.trim();
  if (!title) return;
  document.querySelector('h1').textContent = title;
  document.querySelector('#status').textContent = 'Headline preview updated for this tab.';
});
