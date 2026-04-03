interface IPanelVisibilityOptions {
  selector: string;
  transitionMs?: number;
  managePointerEvents?: boolean;
  debugName?: string;
}

function getPanel(
  host: ParentNode,
  options: IPanelVisibilityOptions
): HTMLElement | null {
  const panel = host.querySelector(options.selector) as HTMLElement | null;
  if (!panel && options.debugName) {
    console.error(`${options.debugName} element not found`);
  }
  return panel;
}

export function showPanel(
  host: ParentNode,
  options: IPanelVisibilityOptions,
  setVisible: (visible: boolean) => void
): void {
  const panel = getPanel(host, options);
  if (!panel) return;

  if (options.debugName) {
    console.log(`Showing ${options.debugName}`);
  }

  panel.style.display = 'block';
  if (options.managePointerEvents !== false) {
    panel.style.pointerEvents = 'auto';
  }
  setVisible(true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('visible');
    });
  });
}

export function hidePanel(
  host: ParentNode,
  options: IPanelVisibilityOptions,
  setVisible: (visible: boolean) => void
): void {
  const panel = getPanel(host, options);
  if (!panel) return;

  if (options.debugName) {
    console.log(`Hiding ${options.debugName}`);
  }

  panel.classList.remove('visible');
  if (options.managePointerEvents !== false) {
    panel.style.pointerEvents = 'none';
  }

  setTimeout(() => {
    panel.style.display = 'none';
    setVisible(false);
  }, options.transitionMs ?? 300);
}

export function getPanelRenderStyles(isVisible: boolean): {
  displayStyle: string;
  pointerEvents: string;
} {
  return {
    displayStyle: isVisible ? 'block' : 'none',
    pointerEvents: isVisible ? 'auto' : 'none'
  };
}

export function restoreVisibleClass(
  host: ParentNode,
  selector: string,
  isVisible: boolean
): void {
  if (!isVisible) return;
  (host.querySelector(selector) as HTMLElement | null)?.classList.add('visible');
}

export function togglePanelVisibility(
  isVisible: boolean,
  hide: () => void,
  show: () => void
): void {
  if (isVisible) {
    hide();
    return;
  }
  show();
}
