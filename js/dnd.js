// ============================================================================
// Drag & drop vertical para reordenar listas (táctil + ratón, Pointer Events)
// ============================================================================
// makeSortable(container, { handle, onReorder })
//  - handle: selector del tirador dentro de cada fila (hijo directo de container)
//  - onReorder(children): se llama al soltar con los hijos ya en el nuevo orden
// ============================================================================

export function makeSortable(container, { handle = ".drag-handle", onReorder } = {}) {
  container.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(handle);
    if (!h || !container.contains(h)) return;
    const row = [...container.children].find((c) => c.contains(h));
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();

    let baseY = e.clientY;
    let moved = false;
    row.classList.add("dragging");
    try { h.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      moved = true;
      row.style.transform = `translateY(${ev.clientY - baseY}px)`;
      // ¿Hemos cruzado el punto medio de algún hermano? → recolocar en el DOM.
      // Comparamos por índice (no por coordenadas del row, que ya lleva transform).
      const kids = [...container.children];
      const rowIdx = kids.indexOf(row);
      for (const s of kids) {
        if (s === row) continue;
        const r = s.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const sIdx = kids.indexOf(s);
        if (ev.clientY < mid && rowIdx > sIdx) {
          container.insertBefore(row, s);
          baseY = ev.clientY;
          row.style.transform = "";
          break;
        }
        if (ev.clientY > mid && rowIdx < sIdx) {
          s.after(row);
          baseY = ev.clientY;
          row.style.transform = "";
          break;
        }
      }
    };
    const onUp = () => {
      h.removeEventListener("pointermove", onMove);
      row.classList.remove("dragging");
      row.style.transform = "";
      if (moved && onReorder) onReorder([...container.children]);
    };
    h.addEventListener("pointermove", onMove);
    h.addEventListener("pointerup", onUp, { once: true });
    h.addEventListener("pointercancel", onUp, { once: true });
  });
}
