(() => {
  'use strict';

  function init() {
    const source = document.querySelector('textarea[data-wordsea-friends]');
    const editor = document.querySelector('.wordsea-friends-editor');
    if (!source || !editor || editor.dataset.ready) return;
    editor.dataset.ready = 'true';
    const defaults = JSON.parse(editor.dataset.defaults);
    let rows = [];
    let serial = 0;
    const make = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const button = (label, handler, className = '') => {
      const element = make('button', `btn ${className}`, label);
      element.type = 'button';
      element.addEventListener('click', handler);
      return element;
    };
    const toolbar = make('div', 'ws-toolbar');
    const list = make('div', 'ws-list');
    const status = make('p', 'ws-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    editor.append(toolbar, list, status);
    const announce = (message, error = false) => {
      status.textContent = message;
      status.classList.toggle('ws-error', error);
    };
    const sync = () => { source.value = JSON.stringify(rows, null, 2); };
    const validUrl = value => {
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !!url.hostname && !url.username && !url.password;
      } catch (_) { return false; }
    };
    const keyForUrl = value => {
      try {
        const url = new URL(value);
        return `${url.hostname.toLowerCase()}${url.port ? ':' + url.port : ''}${url.pathname.replace(/\/$/, '')}${url.search}${url.hash}`;
      } catch (_) { return value.trim(); }
    };
    const fields = [
      ['name', '名称', true, "例如：Jeanhua's Blog"],
      ['url', '网址', true, 'https://example.com/'],
      ['description', '简介（选填）', false, '一句简短介绍'],
      ['avatar', '头像网址（选填）', false, 'https://example.com/avatar.png']
    ];
    function render(focusRow, focusField = 'name') {
      list.replaceChildren();
      rows.forEach((row, index) => {
        const card = make('section', 'ws-card');
        const head = make('div', 'ws-card-head');
        const title = make('h3', 'ws-card-title', `${index + 1}. ${row.name || '新友链'}`);
        const actions = make('div', 'ws-actions');
        const move = delta => {
          const target = index + delta;
          [rows[index], rows[target]] = [rows[target], rows[index]];
          sync();
          render(target, delta < 0 ? 'up' : 'down');
          announce('顺序已调整，保存设置后生效。');
        };
        const up = button('上移', () => move(-1));
        const down = button('下移', () => move(1));
        up.disabled = index === 0;
        down.disabled = index === rows.length - 1;
        up.dataset.field = 'up'; down.dataset.field = 'down';
        for (const [control, label] of [[up, '上移'], [down, '下移']]) {
          control.setAttribute('aria-label', `${label}第 ${index + 1} 条友链`);
        }
        const remove = button('删除', () => {
          rows.splice(index, 1);
          sync();
          render(Math.min(index, rows.length - 1));
          if (!rows.length) add.focus();
          announce('友链已移除，保存设置后生效。');
        }, 'ws-remove');
        remove.setAttribute('aria-label', `删除第 ${index + 1} 条友链`);
        actions.append(up, down, remove);
        head.append(title, actions);
        const inputs = make('div', 'ws-fields');
        for (const [key, label, required, placeholder] of fields) {
          const field = make('div', 'ws-field');
          const input = make('input');
          input.type = 'text';
          input.id = `wordsea-friend-${++serial}-${key}`;
          input.dataset.field = key;
          input.value = typeof row[key] === 'string' ? row[key] : '';
          input.required = required;
          input.placeholder = placeholder;
          if (key === 'url' || key === 'avatar') {
            input.inputMode = 'url';
            input.spellcheck = false;
            input.autocapitalize = 'none';
          }
          const fieldLabel = make('label', '', label);
          fieldLabel.htmlFor = input.id;
          const validate = () => {
            let message = '';
            if (required && !input.value.trim()) message = `请填写${label}。`;
            else if ((key === 'url' || key === 'avatar') && input.value && !validUrl(input.value)) {
              message = '请填写完整的 http/https 地址，不包含用户名或密码。';
            }
            input.setCustomValidity(message);
          };
          validate();
          input.addEventListener('input', () => {
            row[key] = input.value;
            validate(); sync();
            if (key === 'name') title.textContent = `${index + 1}. ${input.value || '新友链'}`;
          });
          field.append(fieldLabel, input);
          inputs.append(field);
        }
        card.append(head, inputs);
        list.append(card);
      });
      if (!rows.length) list.append(make('p', 'ws-empty', '暂无友链。点击「新增友链」开始添加，保存后友链页显示空列表。'));
      const label = source.parentElement.querySelector('label');
      if (label) label.removeAttribute('for');
      const focusedCard = list.children[focusRow];
      if (focusedCard) {
        const control = focusedCard.querySelector(`[data-field="${focusField}"]`);
        if (control && !control.disabled) control.focus();
        else focusedCard.querySelector('input').focus();
      }
    }
    const add = button('新增友链', () => {
      rows.push({name: '', url: '', description: '', avatar: ''});
      sync(); render(rows.length - 1);
      announce('填写新友链后，点击「保存设置」。');
    }, 'primary');
    const presets = button('添加预置的三条友链', () => {
      const existing = new Set(rows.map(row => keyForUrl(row.url)));
      let added = 0;
      for (const row of defaults) {
        const key = keyForUrl(row.url);
        if (!existing.has(key)) { rows.push({...row}); existing.add(key); added++; }
      }
      sync(); render();
      announce(added ? `已追加 ${added} 条预置友链，已有链接保留；保存设置后生效。` : '这三条友链已在列表中，无需重复添加。');
    });
    const recover = button('重新读取 JSON', () => load());
    function load() {
      try {
        const parsed = source.value.trim() ? JSON.parse(source.value) : defaults;
        if (!Array.isArray(parsed) || parsed.some(row => !row || Array.isArray(row) || typeof row !== 'object' ||
          typeof row.name !== 'string' || typeof row.url !== 'string' ||
          (row.description != null && typeof row.description !== 'string') ||
          (row.avatar != null && typeof row.avatar !== 'string'))) throw new Error('Invalid friend list');
        rows = parsed.map(row => ({...row}));
        source.hidden = true;
        toolbar.replaceChildren(add, presets);
        render();
        announce('友链已载入。编辑后点击「保存设置」即可生效。');
      } catch (_) {
        source.hidden = false;
        toolbar.replaceChildren(recover);
        list.replaceChildren();
        announce('原有友链 JSON 格式无法读取，数据已保留。请修正上方 JSON，再点击「重新读取 JSON」。', true);
      }
    }
    source.form.addEventListener('submit', () => { if (source.hidden) sync(); });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
