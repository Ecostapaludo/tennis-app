// Pequeno helper para criar elementos sem framework nenhum.
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list') {
      try { el[key] = value; } catch { el.setAttribute(key, value); }
    } else {
      el.setAttribute(key, value);
    }
  });
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  });
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

// Modal de confirmação própria do app -- window.confirm() nao é confiável em todos os
// contextos em que o app pode rodar (ex: instalado como PWA / dentro de um webview),
// onde a caixa de dialogo nativa pode nao aparecer e o clique parece "não fazer nada".
export function confirmModal(message, onConfirm) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box', style: 'max-width:380px' }, [
    h('p', { style: 'margin:0 0 18px' }, [message]),
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Voltar']),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => { backdrop.remove(); onConfirm(); },
      }, ['Confirmar']),
    ]),
  ]);
  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

export function scoreClass(v) {
  if (v === null || v === undefined) return 'score-mid';
  if (v >= 7.5) return 'score-high';
  if (v >= 5.5) return 'score-mid';
  return 'score-low';
}
