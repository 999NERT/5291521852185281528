class TwitchGiveaway {
    constructor() {
        this.giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
        this.chatConnection = null;
        this.animationInterval = null;
        this.animationSpeed = 50;
        this.animationDeceleration = 0.95;
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
            chatUrl: document.getElementById('chat-url'),
            winnerAnimation: document.querySelector('.winner-animation'),
            participantsTrack: document.querySelector('.participants-track'),
            winnerDisplay: document.querySelector('.winner-display'),
            winnerName: document.querySelector('.winner-name'),
            animationCloseBtn: document.querySelector('.animation-close-btn')
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

        this.elements.animationCloseBtn.addEventListener('click', () => {
            this.stopAnimation();
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

            if (rawMessage.includes('PRIVMSG')) {
                try {
                    const tagsStart = rawMessage.indexOf('@');
                    const tagsEnd = rawMessage.indexOf(' ');
                    const tagsStr = rawMessage.substring(tagsStart + 1, tagsEnd);
                    const tags = {};
                    tagsStr.split(';').forEach(tag => {
                        const [key, value] = tag.split('=');
                        tags[key] = value;
                    });

                    const userStart = rawMessage.indexOf(':', 1);
                    const userEnd = rawMessage.indexOf('!');
                    const username = rawMessage.substring(userStart + 1, userEnd);

                    const msgStart = rawMessage.indexOf(':', rawMessage.indexOf('PRIVMSG'));
                    const messageText = rawMessage.substring(msgStart + 1).trim().toLowerCase();

                    const msgId = tags['id'] || '0';
                    
                    if (parseInt(msgId) <= giveaway.lastMessageId) return;
                    giveaway.lastMessageId = parseInt(msgId);

                    if (messageText === giveaway.chatCommand) {
                        const subMonths = parseInt(tags['badge-info']?.match(/subscriber\/(\d+)/)?.[1]) || 0;
                        const isSubscriber = tags['subscriber'] === '1';

                        let qualifies = false;
                        
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
            const randomIndex = Math.floor(Math.random() * giveaway.participants.length);
            giveaway.winner = giveaway.participants[randomIndex];
            
            this.showWinnerAnimation(giveaway.participants, giveaway.winner);
        }

        giveaway.isActive = false;
        this.saveGiveaways();
        this.renderGiveaways();
    }

    showWinnerAnimation(participants, winner) {
        // Przygotuj animację
        this.elements.participantsTrack.innerHTML = '';
        
        // Duplikuj uczestników dla płynniejszej animacji
        const extendedParticipants = [...participants, ...participants, ...participants];
        
        extendedParticipants.forEach(participant => {
            const card = document.createElement('div');
            card.className = 'participant-card';
            card.textContent = participant;
            if (participant === winner) {
                card.classList.add('highlighted');
            }
            this.elements.participantsTrack.appendChild(card);
        });
        
        // Ustaw pozycję początkową
        const winnerIndex = extendedParticipants.indexOf(winner);
        const cardWidth = 150; // Dostosuj do rzeczywistej szerokości karty
        const finalPosition = -((winnerIndex - 2) * (cardWidth + 20));
        
        this.elements.participantsTrack.style.setProperty('--final-position', `${finalPosition}px`);
        this.elements.participantsTrack.style.transform = 'translateX(0)';
        
        // Ustaw nazwę zwycięzcy
        this.elements.winnerName.textContent = winner;
        
        // Pokaż animację
        this.elements.winnerAnimation.classList.add('active');
        
        // Rozpocznij animację
        this.startAnimation(finalPosition);
    }

    startAnimation(finalPosition) {
        let currentSpeed = this.animationSpeed;
        let currentPosition = 0;
        
        this.animationInterval = setInterval(() => {
            currentPosition -= currentSpeed;
            currentSpeed *= this.animationDeceleration;
            
            this.elements.participantsTrack.style.transform = `translateX(${currentPosition}px)`;
            
            // Podświetl kartę znajdującą się na środku
            const cards = document.querySelectorAll('.participant-card');
            cards.forEach(card => card.classList.remove('highlighted'));
            
            const containerCenter = window.innerWidth / 2;
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const cardCenter = rect.left + rect.width / 2;
                if (Math.abs(cardCenter - containerCenter) < rect.width / 3) {
                    card.classList.add('highlighted');
                }
            });
            
            // Zakończ animację gdy zwolni
            if (currentSpeed < 0.5) {
                clearInterval(this.animationInterval);
                this.elements.participantsTrack.style.transform = `translateX(var(--final-position))`;
                this.elements.winnerDisplay.style.opacity = '1';
                this.elements.winnerDisplay.style.transform = 'translateY(0)';
            }
        }, 16);
    }

    stopAnimation() {
        clearInterval(this.animationInterval);
        this.elements.winnerAnimation.classList.remove('active');
        this.elements.winnerDisplay.style.opacity = '0';
        this.elements.winnerDisplay.style.transform = 'translateY(20px)';
    }

    // ... (reszta metod pozostaje bez zmian)
}

document.addEventListener('DOMContentLoaded', () => {
    new TwitchGiveaway();
});
