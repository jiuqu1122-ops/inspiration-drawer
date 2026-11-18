/* Compact desktop-Chat-style pickers over the existing native select contract. */
(() => {
  const controllers = new Map();
  let active;
  const icon = name => {
    // Clone trusted build-generated inline geometry; no image request, <use>
    // shadow tree, eval, or remote markup is involved.
    const template = document.getElementById('panel-icon-' + name);
    const svg = template?.content?.firstElementChild;
    if (!svg) throw new Error('Missing embedded panel icon: ' + name);
    return svg.cloneNode(true);
  };
  const closeAll = (restoreFocus = false) => {
    if (!active) return;
    const { trigger, menu } = active;
    active = undefined; menu.remove(); trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls'); if (restoreFocus) trigger.focus({ preventScroll: true });
  };
  const place = () => {
    if (!active) return;
    const { trigger, menu } = active, box = trigger.getBoundingClientRect();
    const width = document.documentElement.clientWidth, height = innerHeight, gap = 7, edge = 8;
    if (box.width <= 0 || box.height <= 0 || box.bottom < 0 || box.top > height) { closeAll(); return; }
    const above = box.top - gap - edge, below = height - box.bottom - gap - edge;
    const up = above >= 84 || above >= below;
    menu.style.width = Math.min(Math.max(168, box.width), Math.max(80, width - edge * 2)) + 'px';
    menu.style.maxHeight = Math.max(28, Math.min(238, up ? above : below)) + 'px';
    const actual = menu.getBoundingClientRect();
    menu.style.left = Math.max(edge, Math.min(box.left, width - actual.width - edge)) + 'px';
    menu.style.top = Math.max(edge, Math.min(up ? box.top - gap - actual.height : box.bottom + gap, height - actual.height - edge)) + 'px';
  };
  const selectedOptions = select => Array.from(select.options).filter(option => !option.disabled && !option.hidden);
  const renderMenu = () => {
    if (!active) return;
    const { select, menu } = active;
    const options = selectedOptions(select);
    const signature = JSON.stringify(options.map(option => [option.value, option.textContent])) + select.value;
    if (menu.dataset.options === signature) { place(); return; }
    const scrollTop = menu.scrollTop;
    menu.dataset.options = signature;
    menu.replaceChildren(...options.map(option => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'panel-picker-option';
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.value === select.value));
      button.title = option.textContent || option.value;
      const copy = document.createElement('span'); copy.textContent = option.textContent || option.value; button.append(copy);
      if (option.value === select.value) { button.classList.add('is-selected'); button.append(icon('check')); }
      button.addEventListener('click', () => {
        if (select.disabled) { closeAll(); return; }
        select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true }));
        sync(select); closeAll(true);
      });
      return button;
    }));
    menu.scrollTop = scrollTop; place();
  };
  const open = controller => {
    if (active?.select === controller.select) { closeAll(); return; }
    closeAll();
    if (controller.select.disabled || !selectedOptions(controller.select).length) return;
    const menu = document.createElement('div'); menu.className = 'panel-picker-menu'; menu.id = controller.select.id + '-menu';
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', '选择' + controller.label);
    active = { ...controller, menu }; document.body.append(menu);
    controller.trigger.setAttribute('aria-expanded', 'true'); controller.trigger.setAttribute('aria-controls', menu.id);
    renderMenu();
    menu.addEventListener('keydown', event => {
      const buttons = Array.from(menu.querySelectorAll('button'));
      const index = buttons.indexOf(document.activeElement);
      const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : offset ? buttons[(index + offset + buttons.length) % buttons.length] : undefined;
      if (target) { event.preventDefault(); target.focus(); }
      if (event.key === 'Tab') closeAll();
    });
  };
  function sync(select) {
    const controller = controllers.get(select); if (!controller) return;
    const option = select.selectedOptions[0] || select.options[0];
    controller.copy.textContent = option?.textContent || '自动选择';
    controller.trigger.disabled = select.disabled || select.options.length === 0;
    controller.trigger.title = select.title || controller.label + '：' + controller.copy.textContent;
    controller.trigger.setAttribute('aria-label', controller.label + '：' + controller.copy.textContent);
    if (active?.select === select) {
      if (controller.trigger.disabled || select.closest('[hidden]')) closeAll(); else renderMenu();
    }
  }
  document.querySelectorAll('.panel-picker > select').forEach(select => {
    const wrapper = select.parentElement, trigger = document.createElement('button'), copy = document.createElement('span');
    const label = select.getAttribute('aria-label') || '模型';
    trigger.type = 'button'; trigger.className = 'panel-picker-trigger'; trigger.id = select.id + '-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    trigger.append(copy, icon('chevron-down')); wrapper.append(trigger); wrapper.classList.add('is-enhanced');
    select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const controller = { select, trigger, copy, label }; controllers.set(select, controller);
    trigger.addEventListener('click', () => open(controller));
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); if (active?.select !== select) open(controller);
        const options = active?.menu.querySelectorAll('button');
        if (options?.length) (event.key === 'End' || event.key === 'ArrowUp' ? options[options.length - 1] : options[0]).focus();
      }
    });
    select.addEventListener('change', () => sync(select)); sync(select);
  });
  document.addEventListener('pointerdown', event => { if (active && !active.menu.contains(event.target) && !active.trigger.contains(event.target)) closeAll(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active) { event.preventDefault(); closeAll(true); } });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', event => { if (!active?.menu.contains(event.target)) place(); }, true);
  window.rhinoPickers = { syncAll: () => controllers.forEach(({select}) => sync(select)), sync, closeAll, isOpen: select => active?.select === select };
})();
