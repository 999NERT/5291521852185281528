class TwitchGiveaway {
    constructor() {
        this.giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
        this.chatConnection = null;
        this.init();
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.renderGiveaways();
        this.startTimerUpdates();
    }

    cacheElements() {
        this.elements = {
            startButton: document.getElementById('start-giveaway'),
            activeGiveaways: document.getElementById('active-giveaways'),
            completedGiveaways: document.getElementById('completed-giveaways'),
            requirementButtons: document.querySelectorAll('.req-btn'),
            selectedRequirement: document.getElementById('selected-requirement'),
            tabs: document.querySelectorAll('.tab'),
            tabContents: document.querySelectorAll('.tab-content'),
            giveawayName: document.getElementById('giveaway-name'),
            giveawayDescription: document.getElementById('giveaway-description'),
            giveawayDuration: document.getElementById('giveaway-duration'),
            chatCommand: document.getElementById('chat-command'),
            chatUrl: document.getElementById('chat-url')
        };
    }

    setupEventListeners() {
        this.elements.startButton.addEventListener('click', () => this.startNewGiveaway());
        
        this.elements.requirementButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.elements.requirementButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.elements.selectedRequirement.value = button.dataset.req;
            });
        });
        
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    }

    async startNewGiveaway() {
        const name = this.elements.giveawayName.value.trim();
        const description = this.elements.giveawayDescription.value.trim();
        const duration = parseInt(this.elements.giveawayDuration.value);
        const channelName = this.elements.chatUrl.value.trim().toLowerCase();
        const requirement = this.elements.selectedRequirement.value;
        const chatCommand = this.elements.chatCommand.value.trim().toLowerCase();

        if (!name || !channelName) {
            alert('Proszę podać nazwę losowania i nazwę kanału');
            return;
        }

        const newGiveaway = {
            id: Date.now(),
            name,
            description,
            duration,
            requirement,
            chatCommand,
            channelName,
            startTime: new Date(),
            endTime: new Date(Date.now() + duration * 60000),
            participants: [],
            winner: null,
            isActive: true,
            lastMessageId: 0
        };

        this.giveaways.push(newGiveaway);
        this.saveGiveaways();
        this.renderGiveaways();
        this.switchTab('active');
        
        this.connectToTwitchChat(newGiveaway.id);
        
        setTimeout(() => this.endGiveaway(newGiveaway.id), duration * 60000);
        this.resetForm();
    }

    connectToTwitchChat(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;

        if (this.chatConnection) {
            this.chatConnection.close();
        }

        const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
        
        socket.onopen = () => {
            socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            socket.send('PASS oauth:1234567890abcdef1234567890ab');
            socket.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
            socket.send(`JOIN #${giveaway.channelName}`);
        };

        socket.onmessage = (event) => {
            const rawMessage = event.data;
            
            if (rawMessage.startsWith('PING')) {
                socket.send('PONG :tmi.twitch.tv');
                return;
            }

            // Nowe, dokładne parsowanie wiadomości
            if (rawMessage.includes('PRIVMSG')) {
                try {
                    // Parsowanie tagów
                    const tagsStart = rawMessage.indexOf('@');
                    const tagsEnd = rawMessage.indexOf(' ');
                    const tagsStr = rawMessage.substring(tagsStart + 1, tagsEnd);
                    const tags = {};
                    tagsStr.split(';').forEach(tag => {
                        const [key, value] = tag.split('=');
                        tags[key] = value;
                    });

                    // Parsowanie nazwy użytkownika
                    const userStart = rawMessage.indexOf(':', 1);
                    const userEnd = rawMessage.indexOf('!');
                    const username = rawMessage.substring(userStart + 1, userEnd);

                    // Parsowanie treści wiadomości
                    const msgStart = rawMessage.indexOf(':', rawMessage.indexOf('PRIVMSG'));
                    const messageText = rawMessage.substring(msgStart + 1).trim().toLowerCase();

                    // Parsowanie ID wiadomości
                    const msgId = tags['id'] || '0';
                    
                    // Sprawdzanie czy to nowa wiadomość
                    if (parseInt(msgId) <= giveaway.lastMessageId) return;
                    giveaway.lastMessageId = parseInt(msgId);

                    // Sprawdzanie komendy
                    if (messageText === giveaway.chatCommand) {
                        // Pobieranie danych subskrypcji
                        const subMonths = parseInt(tags['badge-info']?.match(/subscriber\/(\d+)/)?.[1]) || 0;
                        const isSubscriber = tags['subscriber'] === '1';

                        let qualifies = false;
                        
                        // Logika weryfikacji
                        switch(giveaway.requirement) {
                            case 'all':
                                qualifies = true;
                                break;
                            case '3':
                                qualifies = subMonths >= 3 || (isSubscriber && subMonths === 0);
                                break;
                            case '6':
                                qualifies = subMonths >= 6;
                                break;
                            case '9':
                                qualifies = subMonths >= 9;
                                break;
                            case '12':
                                qualifies = subMonths >= 12;
                                break;
                            case '18':
                                qualifies = subMonths >= 18;
                                break;
                            case '24':
                                qualifies = subMonths >= 24;
                                break;
                            default:
                                qualifies = isSubscriber;
                        }

                        if (qualifies && !giveaway.participants.includes(username)) {
                            giveaway.participants.push(username);
                            this.saveGiveaways();
                            this.renderGiveaways();
                        }
                    }
                } catch (e) {
                    console.error('Błąd parsowania wiadomości:', e);
                }
            }
        };

        socket.onerror = (error) => {
            console.error('Błąd połączenia czatu:', error);
        };

        this.chatConnection = socket;
    }

    endGiveaway(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;

        if (this.chatConnection) {
            this.chatConnection.close();
            this.chatConnection = null;
        }

        if (giveaway.participants.length > 0) {
            giveaway.winner = giveaway.participants[
                Math.floor(Math.random() * giveaway.participants.length)
            ];
        }

        giveaway.isActive = false;
        this.saveGiveaways();
        this.renderGiveaways();

        alert(giveaway.winner 
            ? `Zwycięzca: ${giveaway.winner}` 
            : 'Brak kwalifikujących się uczestników');
    }

    clearCompletedGiveaways() {
        if (confirm('Czy na pewno chcesz usunąć wszystkie zakończone losowania?')) {
            this.giveaways = this.giveaways.filter(g => g.isActive);
            this.saveGiveaways();
            this.renderGiveaways();
        }
    }

    renderGiveaways() {
        this.elements.activeGiveaways.innerHTML = '';
        this.elements.completedGiveaways.innerHTML = '';

        if (this.giveaways.some(g => !g.isActive)) {
            const clearBtn = document.createElement('button');
            clearBtn.className = 'danger-btn';
            clearBtn.textContent = 'Wyczyść zakończone losowania';
            clearBtn.onclick = () => this.clearCompletedGiveaways();
            this.elements.completedGiveaways.appendChild(clearBtn);
        }

        this.giveaways.forEach(giveaway => {
            const element = document.createElement('div');
            element.className = 'giveaway-item';
            
            const timeLeft = this.getTimeLeft(giveaway);
            const requirementText = giveaway.requirement === 'all' ? 'Wszyscy' : `Sub ${giveaway.requirement}+`;
            const participantsList = giveaway.participants.slice(-3).join(', ') || 'Brak uczestników';

            element.innerHTML = `
                <h3>${giveaway.name}</h3>
                <p>${giveaway.description}</p>
                <div class="requirements">
                    Wymagania: ${requirementText}
                    ${giveaway.chatCommand ? `<span class="command-indicator">Komenda: ${giveaway.chatCommand}</span>` : ''}
                </div>
                <p>Kanał: ${giveaway.channelName}</p>
                <p class="participants-count">Uczestnicy: ${giveaway.participants.length}</p>
                ${timeLeft}
                ${giveaway.isActive ? `
                    <button class="danger-btn" data-id="${giveaway.id}">Zakończ wcześniej</button>
                    <div class="participant-list">
                        Ostatni uczestnicy: ${participantsList}
                    </div>
                ` : `
                    <p>Zakończono: ${new Date(giveaway.endTime).toLocaleString()}</p>
                    ${giveaway.winner ? `<div class="winner">🏆 ${giveaway.winner} 🏆</div>` : ''}
                `}
            `;

            if (giveaway.isActive) {
                this.elements.activeGiveaways.appendChild(element);
            } else {
                this.elements.completedGiveaways.appendChild(element);
            }
        });

        document.querySelectorAll('.danger-btn[data-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('Na pewno zakończyć losowanie?')) {
                    this.endGiveaway(parseInt(e.target.dataset.id));
                }
            });
        });
    }

    getTimeLeft(giveaway) {
        if (!giveaway.isActive) return '';
        
        const diff = giveaway.endTime - new Date();
        if (diff <= 0) return '';
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `<div class="timer">Kończy się za: ${minutes}m ${seconds}s</div>`;
    }

    saveGiveaways() {
        localStorage.setItem('twitchSubGiveaways', JSON.stringify(this.giveaways));
    }

    switchTab(tabName) {
        this.elements.tabs.forEach(tab => tab.classList.remove('active'));
        this.elements.tabContents.forEach(content => content.classList.remove('active'));
        
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    startTimerUpdates() {
        setInterval(() => {
            const now = new Date();
            this.giveaways.forEach(giveaway => {
                if (giveaway.isActive && now >= giveaway.endTime) {
                    this.endGiveaway(giveaway.id);
                }
            });
            this.renderGiveaways();
        }, 1000);
    }

    resetForm() {
        this.elements.giveawayName.value = '';
        this.elements.giveawayDescription.value = '';
        this.elements.chatCommand.value = '';
        this.elements.chatUrl.value = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TwitchGiveaway();
});
