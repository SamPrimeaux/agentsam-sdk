const input = document.querySelector('#json');
const search = document.querySelector('#search');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
function render() {
  try {
    const parsed = JSON.parse(input.value);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const query = search.value.toLocaleLowerCase();
    const matches = rows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(query));
    result.textContent = JSON.stringify(matches, null, 2);
    status.textContent = `${matches.length} of ${rows.length} records`;
    status.classList.remove('error');
  } catch {
    status.textContent = 'This JSON needs a fix. Check the quotes, commas, and brackets.';
    status.classList.add('error');
    result.textContent = '';
  }
}
input.addEventListener('input', render);
search.addEventListener('input', render);
render();
