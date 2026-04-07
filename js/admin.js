
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.removeAttribute('hidden');
  modal.classList.add('isOn');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('isOn');
  modal.setAttribute('hidden', 'hidden');
  document.body.style.overflow = '';
}
