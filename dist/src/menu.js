// The frog's menu (2026-10-27, owner: "make the frog button a menu entry with several submenus, put first he dark/light
// switch in, then the music and sound switches, then add a "fullscreen mode" for the house"): the LCP logo in the top bar
// opens it. Its entries, in that order: light / dark, the music (the radio), the house's sound, full screen, and last the
// link to the 1985 original the logo was until then. main.js says what an entry does (onPick) and what it shows (set);
// the talk line changes the same states, and main.js sets them here again (menuSync), so the menu always shows them.
// A menu button as WAI-ARIA's pattern has it: Enter, Space or Down open it on the first entry, Up on the last; Up, Down,
// Home and End move; Enter does an entry and closes (back on the button), Space does it and stays open; Esc closes back on
// the button, Tab closes and moves on; a click outside (or into the column's frame: the window loses focus) closes it. A
// click on a switch keeps it open, so the new state shows; full screen and the link close it (the page moves, or a tab
// opens).

export class Menu {
  constructor({ button, menu, onPick = () => {} }) {
    this.button = button; this.menu = menu; this.onPick = onPick;
    this.wrap = button.parentElement;
    button.addEventListener('click', () => (this.isOpen ? this.close(false) : this.open('first')));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.open(e.key === 'ArrowUp' ? 'last' : 'first'); }
    });
    menu.addEventListener('mousedown', (e) => e.preventDefault());       // a click keeps the focus where it is (Safari: no blur)
    menu.addEventListener('click', (e) => {
      const it = e.target.closest('.menu-item');
      if (!it || !menu.contains(it)) return;
      if (it.tagName === 'A') { this.close(false); return; }              // the link opens its tab as links do
      this.pick(it, it.dataset.item === 'full');
    });
    menu.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.wrap.contains(e.target)) this.close(false); }, true);
    window.addEventListener('blur', () => { if (this.isOpen) this.close(false); });
  }

  get isOpen() { return !this.menu.hidden; }
  items() { return [...this.menu.querySelectorAll('.menu-item')].filter((e) => !e.hidden); }

  open(at = 'first') {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    const list = this.items();
    const it = at === 'last' ? list[list.length - 1] : list[0];
    if (it) it.focus();
  }

  // back: the focus goes back to the button (Esc, Enter, an entry); an outside click leaves it where the click put it
  close(back = true) {
    if (!this.isOpen) return;
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (back) this.button.focus();
  }

  pick(it, close) {
    this.onPick(it.dataset.item);
    if (close) this.close(true);
  }

  key(e) {
    const list = this.items(), i = list.indexOf(document.activeElement);
    const go = (k) => { e.preventDefault(); const n = list.length; if (n) list[((k % n) + n) % n].focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); }
    else if (e.key === 'Tab') this.close(false);
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
      const it = list[i];
      e.preventDefault();
      if (it.tagName === 'A') { it.click(); this.close(true); return; }
      this.pick(it, e.key === 'Enter' || it.dataset.item === 'full');
    }
  }

  // an entry's state: on or off (aria-checked, and the word at its right end); sub: the small line under its name, if given
  set(item, on, sub) {
    const it = this.menu.querySelector(`[data-item="${item}"]`);
    if (!it) return;
    it.setAttribute('aria-checked', String(!!on));
    const w = it.querySelector('.menu-state');
    if (w) w.textContent = on ? 'on' : 'off';
    const s = it.querySelector('.menu-sub');
    if (s && sub != null) s.textContent = sub;
  }
}
