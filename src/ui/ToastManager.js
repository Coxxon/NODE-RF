import { Store } from '../core/Store.js';

export const ToastManager = {
    init() {
        if (document.getElementById('toast-container')) return;
        
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);

        document.addEventListener('app:toast', (e) => {
            const { message, actionLabel, onAction } = e.detail;
            this.show(message, actionLabel, onAction);
        });
    },

    show(message, actionLabel = null, onAction = null) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-bubble';
        
        const text = document.createElement('span');
        text.className = 'toast-text';
        text.textContent = message;
        toast.appendChild(text);

        if (actionLabel && onAction) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast-undo-btn';
            actionBtn.textContent = actionLabel.toUpperCase();
            actionBtn.addEventListener('click', () => {
                onAction();
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            });
            toast.appendChild(actionBtn);
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
