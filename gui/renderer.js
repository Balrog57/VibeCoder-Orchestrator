const messagesList = document.getElementById('messages-list');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const activeRepo = document.getElementById('active-repo');
const statusText = document.getElementById('status-text');
const tilesContainer = document.getElementById('tiles-container');
const initialSystemMessage = document.getElementById('system-welcome');
const chatTitle = document.getElementById('chat-title');

let currentLocale = 'fr';

const I18N = {
    fr: {
        noProject: '📂 Aucun projet',
        ready: 'Pret a coder !',
        welcome: 'Bienvenue ! Selectionnez un projet sur Telegram ou via les tuiles ci-dessous.',
        chatTitle: 'VibeRemote Chat',
        inputPlaceholder: 'Decrivez votre idee...',
        send: 'Envoyer'
    },
    en: {
        noProject: '📂 No active project',
        ready: 'Ready to code!',
        welcome: 'Welcome! Select a project from Telegram or with the tiles below.',
        chatTitle: 'VibeRemote Chat',
        inputPlaceholder: 'Describe your idea...',
        send: 'Send'
    }
};

function tr(key) {
    const dict = I18N[currentLocale] || I18N.fr;
    return dict[key] || key;
}

function applyLocale() {
    document.documentElement.lang = currentLocale;
    if (!activeRepo.innerText || activeRepo.innerText.includes('Aucun') || activeRepo.innerText.includes('No active')) {
        activeRepo.innerText = tr('noProject');
    }
    if (!statusText.innerText || statusText.innerText.includes('Pret') || statusText.innerText.includes('Prêt') || statusText.innerText.includes('Ready')) {
        statusText.innerText = tr('ready');
    }
    if (initialSystemMessage) {
        initialSystemMessage.innerText = tr('welcome');
    }
    if (chatTitle) chatTitle.innerText = tr('chatTitle');
    if (userInput) userInput.placeholder = tr('inputPlaceholder');
    if (sendBtn) sendBtn.innerText = tr('send');
}

function addMessage(text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    
    // Si marked est chargé, on l'utilise pour le markdown
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        div.innerHTML = marked.parse(text);
    } else {
        div.innerText = text;
    }
    
    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight;
}

function handleSend() {
    const text = userInput.value.trim();
    if (text) {
        addMessage(text, 'me');
        window.electronAPI.sendMessage(text);
        userInput.value = '';
    }
}

function renderTiles(tiles) {
    tilesContainer.innerHTML = '';
    if (!tiles) return;

    // Flatten rows for the grid
    const allTiles = tiles.flat();
    
    allTiles.forEach(tile => {
        const btn = document.createElement('button');
        btn.className = 'tile-btn';
        btn.innerText = tile.text;
        btn.onclick = () => {
            window.electronAPI.sendAction(tile.callback_data);
        };
        tilesContainer.appendChild(btn);
    });
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Listen for messages from the main process
window.electronAPI.onMessage((data) => {
    addMessage(data.text, 'bot');
});

// Listen for status updates (e.g., "Analyzing...", "Running tests...")
window.electronAPI.onStatusUpdate((data) => {
    statusText.innerText = data.text;
});

// Listen for tiles updates (buttons/menu)
window.electronAPI.onTilesUpdate((data) => {
    renderTiles(data.tiles);
});

// Listen for session updates (e.g., active repo change)
window.electronAPI.onSessionUpdate((data) => {
    if (data.locale) {
        currentLocale = (data.locale || 'fr').slice(0, 2).toLowerCase();
        applyLocale();
    }
    if (data.activeRepo) {
        activeRepo.innerText = `📂 ${data.activeRepo}`;
    } else {
        activeRepo.innerText = tr('noProject');
    }
});

window.electronAPI.onLocaleUpdate((data) => {
    currentLocale = (data.locale || 'fr').slice(0, 2).toLowerCase();
    applyLocale();
});

applyLocale();
