import { Store } from '../core/Store.js';

export const ToastManager = {
    init() {
        if (document.getElementById('toast-container')) return;
        
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);

        document.addEventListener('app:toast', (e) => {
            const { message, undo } = e.detail;
            this.show(message, undo);
        });
    },

    show(message, hasUndo = false) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-bubble';
        
        const text = document.createElement('span');
        text.className = 'toast-text';
        text.textContent = message;
        toast.appendChild(text);

        if (hasUndo) {
            const undoBtn = document.createElement('button');
            undoBtn.className = 'toast-undo-btn';
            undoBtn.textContent = 'ANNULER';
            undoBtn.addEventListener('click', () => {
                Store.undo();
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
                
                // Refresh tabs after undo
                const pagesTabGroup = document.getElementById('pagesTabGroup');
                if (pagesTabGroup) {
                    // We need to re-render tabs. Since ToastManager is a separate module,
                    // we can dispatch an event or rely on main.js to handle it.
                    // For now, let's assume Store.undo() triggers a state change that main.js listens to.
                    document.dispatchEvent(new CustomEvent('app:state-restored'));
                }
            });
            toast.appendChild(undoBtn);
        }

        container.appendChild(toast);

        // Auto-remove after 5s
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
};
