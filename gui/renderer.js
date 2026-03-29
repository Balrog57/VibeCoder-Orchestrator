const messagesList = document.getElementById('messages-list');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const activeRepo = document.getElementById('active-repo');
const statusText = document.getElementById('status-text');
const tilesContainer = document.getElementById('tiles-container');
const initialSystemMessage = document.querySelector('.message.system');
const chatTitle = document.getElementById('chat-title');
const dispatchTitle = document.getElementById('dispatch-title');
const dispatchBadge = document.getElementById('dispatch-badge');
const dispatchSource = document.getElementById('dispatch-source');
const sessionMonitorTitle = document.getElementById('session-monitor-title');
const monitorStateLabel = document.getElementById('monitor-state-label');
const monitorStateValue = document.getElementById('monitor-state-value');
const monitorCliLabel = document.getElementById('monitor-cli-label');
const monitorCliValue = document.getElementById('monitor-cli-value');
const monitorModelLabel = document.getElementById('monitor-model-label');
const monitorModelValue = document.getElementById('monitor-model-value');
const monitorProfileLabel = document.getElementById('monitor-profile-label');
const monitorProfileValue = document.getElementById('monitor-profile-value');
const monitorWorkspaceLabel = document.getElementById('monitor-workspace-label');
const monitorWorkspaceValue = document.getElementById('monitor-workspace-value');
const monitorFallbacksLabel = document.getElementById('monitor-fallbacks-label');
const monitorFallbacksValue = document.getElementById('monitor-fallbacks-value');
const monitorAttemptsLabel = document.getElementById('monitor-attempts-label');
const monitorAttemptsValue = document.getElementById('monitor-attempts-value');
const monitorLastTraceLabel = document.getElementById('monitor-last-trace-label');
const monitorLastTraceValue = document.getElementById('monitor-last-trace-value');

const DEFAULT_STRINGS = {
    title: 'VibeRemote',
    noProject: 'No active project',
    ready: 'Ready to code!',
    welcome: 'Welcome! Select a project from Telegram or with the tiles below.',
    inputPlaceholder: 'Describe your idea...',
    send: 'Send',
    dispatchTitle: 'Dispatch',
    dispatchIdle: 'Remote ready',
    dispatchLocal: 'Local action',
    dispatchPipeline: 'Code pipeline',
    monitorTitle: 'Session',
    monitorState: 'State',
    monitorCli: 'CLI',
    monitorModel: 'Model',
    monitorProfile: 'Profile',
    monitorWorkspace: 'Workspace',
    monitorFallbacks: 'Fallbacks',
    monitorAttempts: 'Attempts',
    monitorLastTrace: 'Last trace',
    monitorNone: 'None'
};

let strings = { ...DEFAULT_STRINGS };
let currentDispatch = {
    mode: 'idle',
    modeLabel: DEFAULT_STRINGS.dispatchIdle,
    label: DEFAULT_STRINGS.dispatchIdle,
    sourceLabel: 'Remote'
};

let currentMonitor = {
    stateLabel: 'Idle',
    currentCli: 'Auto',
    currentModel: 'Auto',
    taskProfileLabel: 'Code',
    workspaceModeLabel: 'Project folder',
    fallbackCount: 0,
    activeRunAttempts: 0,
    lastTraceLabel: DEFAULT_STRINGS.monitorNone
};

function applyStrings(nextStrings = {}) {
    strings = { ...strings, ...nextStrings };

    if (currentDispatch.mode === 'idle') {
        currentDispatch.label = strings.dispatchIdle;
    }

    chatTitle.innerText = strings.title;
    dispatchTitle.innerText = strings.dispatchTitle;
    userInput.placeholder = strings.inputPlaceholder;
    sendBtn.innerText = strings.send;
    sessionMonitorTitle.innerText = strings.monitorTitle || DEFAULT_STRINGS.monitorTitle;
    monitorStateLabel.innerText = strings.monitorState || DEFAULT_STRINGS.monitorState;
    monitorCliLabel.innerText = strings.monitorCli || DEFAULT_STRINGS.monitorCli;
    monitorModelLabel.innerText = strings.monitorModel || DEFAULT_STRINGS.monitorModel;
    monitorProfileLabel.innerText = strings.monitorProfile || DEFAULT_STRINGS.monitorProfile;
    monitorWorkspaceLabel.innerText = strings.monitorWorkspace || DEFAULT_STRINGS.monitorWorkspace;
    monitorFallbacksLabel.innerText = strings.monitorFallbacks || DEFAULT_STRINGS.monitorFallbacks;
    monitorAttemptsLabel.innerText = strings.monitorAttempts || DEFAULT_STRINGS.monitorAttempts;
    monitorLastTraceLabel.innerText = strings.monitorLastTrace || DEFAULT_STRINGS.monitorLastTrace;

    if (!activeRepo.dataset.repo) {
        activeRepo.innerText = strings.noProject;
    }

    if (!statusText.dataset.busy || statusText.dataset.busy === 'false') {
        statusText.innerText = strings.ready;
    }

    if (initialSystemMessage) {
        initialSystemMessage.innerText = strings.welcome;
    }

    renderDispatch();
    renderMonitor();
}

function addMessage(text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;

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
    if (!text) return;

    addMessage(text, 'me');
    window.electronAPI.sendMessage(text);
    userInput.value = '';
}

function renderTiles(tiles) {
    tilesContainer.innerHTML = '';
    if (!tiles) return;

    const allTiles = tiles.flat();
    allTiles.forEach(tile => {
        const btn = document.createElement('button');
        btn.className = 'tile-btn';
        btn.innerText = tile.text;
        btn.onclick = () => window.electronAPI.sendAction(tile.callback_data);
        tilesContainer.appendChild(btn);
    });
}

function renderDispatch() {
    const mode = currentDispatch.mode || 'idle';
    const idleLabel = strings.dispatchIdle || DEFAULT_STRINGS.dispatchIdle;
    const localLabel = strings.dispatchLocal || DEFAULT_STRINGS.dispatchLocal;
    const pipelineLabel = strings.dispatchPipeline || DEFAULT_STRINGS.dispatchPipeline;
    const modeLabel = mode === 'local' ? localLabel : mode === 'pipeline' ? pipelineLabel : idleLabel;
    const detail = currentDispatch.label && currentDispatch.label !== modeLabel ? ` - ${currentDispatch.label}` : '';

    dispatchBadge.className = `dispatch-badge ${mode}`;
    dispatchBadge.innerText = `${modeLabel}${detail}`;
    dispatchSource.innerText = currentDispatch.sourceLabel || 'Remote';
}

function renderMonitor() {
    monitorStateValue.innerText = currentMonitor.stateLabel || strings.monitorNone || DEFAULT_STRINGS.monitorNone;
    monitorCliValue.innerText = currentMonitor.currentCli || 'Auto';
    monitorModelValue.innerText = currentMonitor.currentModel || 'Auto';
    monitorProfileValue.innerText = currentMonitor.taskProfileLabel || strings.monitorNone || DEFAULT_STRINGS.monitorNone;
    monitorWorkspaceValue.innerText = currentMonitor.workspaceModeLabel || strings.monitorNone || DEFAULT_STRINGS.monitorNone;
    monitorFallbacksValue.innerText = String(currentMonitor.fallbackCount ?? 0);
    monitorAttemptsValue.innerText = String(currentMonitor.activeRunAttempts ?? 0);
    monitorLastTraceValue.innerText = currentMonitor.lastTraceLabel || strings.monitorNone || DEFAULT_STRINGS.monitorNone;
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keypress', event => {
    if (event.key === 'Enter') handleSend();
});

window.electronAPI.onMessage(data => {
    addMessage(data.text, 'bot');
});

window.electronAPI.onStatusUpdate(data => {
    statusText.innerText = data.text;
    const isBusy = data.text !== strings.ready;
    statusText.dataset.busy = isBusy ? 'true' : 'false';
});

window.electronAPI.onDispatchUpdate(data => {
    currentDispatch = {
        ...currentDispatch,
        ...data
    };
    renderDispatch();
});

window.electronAPI.onTilesUpdate(data => {
    renderTiles(data.tiles);
});

window.electronAPI.onSessionUpdate(data => {
    if (data.strings) {
        applyStrings(data.strings);
    }

    if (data.activeRepo) {
        activeRepo.dataset.repo = data.activeRepo;
        activeRepo.innerText = data.activeRepo;
    } else {
        delete activeRepo.dataset.repo;
        activeRepo.innerText = strings.noProject;
    }

    if (data.monitor) {
        currentMonitor = {
            ...currentMonitor,
            ...data.monitor
        };
        renderMonitor();
    }
});

window.electronAPI.onLocaleUpdate(data => {
    if (data.strings) {
        applyStrings(data.strings);
    }
});

applyStrings();
