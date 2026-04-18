import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ChartContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  // Clamp to viewport so the menu doesn't render off-screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 220;
  const menuH = items.length * 36 + 8;
  const clampedX = Math.min(x, vw - menuW - 8);
  const clampedY = Math.min(y, vh - menuH - 8);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 1000,
        minWidth: menuW,
      }}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg shadow-black/30 p-1 backdrop-blur"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            onClose();
          }}
          disabled={item.disabled}
          role="menuitem"
          className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            item.disabled
              ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              : item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <span>{item.label}</span>
          {item.hint && (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
}
