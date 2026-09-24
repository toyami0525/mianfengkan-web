(() => {
  'use strict';
  const tablist = document.querySelector('.staff-directory-tabs');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  if (panels.some(panel => !panel)) return;

  function selectTab(tab, updateAddress = false) {
    tabs.forEach((button, index) => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
    if (updateAddress) {
      const hash = tab.id === 'house-cat-tab' ? '#house-cat' : '';
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
    }
  }

  function selectFromAddress() {
    selectTab(tabs.find(tab => tab.id === 'house-cat-tab' && window.location.hash === '#house-cat') || tabs[0]);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab, true));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next], true);
      tabs[next].focus();
    });
  });
  window.addEventListener('hashchange', selectFromAddress);
  selectFromAddress();
})();
