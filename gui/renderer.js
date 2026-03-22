const messagesList = document.getElementById('messages-list');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const activeRepo = document.getElementById('active-repo');
const statusText = document.getElementById('status-text');
const tilesContainer = document.getElementById('tiles-container');

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
    if (data.activeRepo) {
        activeRepo.innerText = `📂 ${data.activeRepo}`;
    } else {
        activeRepo.innerText = `📂 Aucun projet`;
    }
});
