class TwitchGiveaway {
    constructor() {
        this.giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
        this.chatConnection = null;
        this.init();
    }

    // ... (pozostałe metody pozostają bez zmian)

    connectToTwitchChat(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;

        if (this.chatConnection) {
            this.chatConnection.close();
        }

        const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
        
        socket.onopen = () => {
            socket.send(`CAP REQ :twitch.tv/tags twitch.tv/commands`);
            socket.send(`PASS oauth:1234567890abcdef1234567890ab`);
            socket.send(`NICK justinfan12345`);
            socket.send(`JOIN #${giveaway.channelName}`);
        };

        socket.onmessage = (event) => {
            const message = event.data;
            
            if (message.startsWith('PING')) {
                socket.send('PONG :tmi.twitch.tv');
                return;
            }

            if (message.includes('PRIVMSG')) {
                const parts = message.split(';');
                const tags = {};
                parts.forEach(part => {
                    const [key, value] = part.split('=');
                    tags[key] = value;
                });

                const messageMatch = message.match(/PRIVMSG #[^:]+:(.*)/);
                
                if (messageMatch) {
                    const username = tags['display-name'] || message.split('!')[0].slice(1);
                    const msg = messageMatch[1].trim().toLowerCase();
                    const monthsSubscribed = parseInt(tags['badge-info']?.match(/subscriber\/(\d+)/)?.[1]) || 0;

                    // Sprawdź czy wiadomość pasuje do komendy
                    if (msg === giveaway.chatCommand) {
                        let qualifies = false;
                        
                        // Logika sprawdzania subskrypcji
                        switch(giveaway.requirement) {
                            case 'all':
                                qualifies = true;
                                break;
                            case '3':
                                qualifies = monthsSubscribed >= 3;
                                break;
                            case '6':
                                qualifies = monthsSubscribed >= 6;
                                break;
                            case '9':
                                qualifies = monthsSubscribed >= 9;
                                break;
                            case '12':
                                qualifies = monthsSubscribed >= 12;
                                break;
                            case '18':
                                qualifies = monthsSubscribed >= 18;
                                break;
                            case '24':
                                qualifies = monthsSubscribed >= 24;
                                break;
                            default:
                                qualifies = false;
                        }

                        if (qualifies && !giveaway.participants.includes(username)) {
                            giveaway.participants.push(username);
                            this.saveGiveaways();
                            this.renderGiveaways();
                        }
                    }
                }
            }
        };

        socket.onerror = (error) => {
            console.error('Błąd połączenia:', error);
        };

        this.chatConnection = socket;
    }

    // Dodaj nową metodę do czyszczenia zakończonych losowań
    clearCompletedGiveaways() {
        if (confirm('Czy na pewno chcesz usunąć wszystkie zakończone losowania?')) {
            this.giveaways = this.giveaways.filter(g => g.isActive);
            this.saveGiveaways();
            this.renderGiveaways();
        }
    }

    // Zaktualizuj metodę renderGiveaways
    renderGiveaways() {
        this.elements.activeGiveaways.innerHTML = '';
        this.elements.completedGiveaways.innerHTML = '';

        // Dodaj przycisk czyszczenia w sekcji zakończonych
        if (this.giveaways.some(g => !g.isActive)) {
            const clearButton = document.createElement('button');
            clearButton.className = 'danger-btn';
            clearButton.textContent = 'Wyczyść zakończone losowania';
            clearButton.addEventListener('click', () => this.clearCompletedGiveaways());
            this.elements.completedGiveaways.appendChild(clearButton);
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
                    <span class="command-indicator">Komenda: ${giveaway.chatCommand}</span>
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

    // ... (reszta metod pozostaje bez zmian)
}
