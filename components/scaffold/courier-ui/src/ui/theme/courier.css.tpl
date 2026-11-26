body {
  font-family: var(--courier-font);
  font-size: var(--courier-font-size);
  color: var(--courier-ink);
  background: var(--courier-paper);
}
.courier-app button, .courier-app input, .courier-app select {
  font-family: var(--courier-font);
  font-size: inherit;
  max-width: 100%;
  box-sizing: border-box;
}
.courier-app input { min-width: 0; }
.courier-app .kit-sav { grid-template-columns: minmax(0, 1fr); }
.courier-app .kit-sav-form { flex-wrap: wrap; }
.courier-app .kit-sav-form input { flex: 1 1 12rem; }
.courier-app h1, .courier-app button {
  overflow-wrap: anywhere;
}
.courier-app [data-part="menu"] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
.courier-board { max-width: 32rem; overflow-x: auto; }
.courier-board [data-courier-grid] { display: grid; gap: 0.5rem; }
.courier-app [data-part="menu"] button, .courier-board button { min-height: 2.75rem; }
