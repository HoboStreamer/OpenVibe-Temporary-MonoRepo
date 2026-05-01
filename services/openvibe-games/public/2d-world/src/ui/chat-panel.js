export class ChatPanel {
    constructor(root) {
        this.root = root;
        this.root.innerHTML = `
            <div class="panel-header">Chat</div>
            <div class="chat-messages"></div>
            <form class="chat-form">
                <input class="chat-input" placeholder="Enter to chat" maxlength="240" />
                <button type="submit">Send</button>
            </form>`;
        this.messagesEl = this.root.querySelector('.chat-messages');
        this.form = this.root.querySelector('.chat-form');
        this.input = this.root.querySelector('.chat-input');
    }

    bindSend(handler) {
        this.form.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = this.input.value.trim();
            if (!value) return;
            handler(value);
            this.input.value = '';
        });
    }

    render(messages) {
        this.messagesEl.innerHTML = (messages || []).slice(-20).map((message) => `
            <div class="chat-message"><strong>${message.display_name}</strong><span>${message.text}</span></div>`).join('');
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    focus() {
        this.input.focus();
        this.input.select();
    }

    blur() {
        this.input.blur();
    }
}
