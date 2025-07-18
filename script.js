class TwitchGiveaway {
    constructor() {
        this.giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
        this.chatInterval = null;
        this.init();
        this.lastMessages = {}; // Śledzenie ostatnich wiadomości
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

    startNewGiveaway() {
        const name = this.elements.giveawayName.value.trim();
        const description = this.elements.giveawayDescription.value.trim();
        const duration = parseInt(this.elements.giveawayDuration.value);
        const chatUrl = this.elements.chatUrl.value.trim();
        const requirement = this.elements.selectedRequirement.value;
        const chatCommand = this.elements.chatCommand.value.trim().toLowerCase();

        if (!name || !chatUrl) {
            alert('Proszę wypełnić wszystkie wymagane pola');
            return;
        }

        const newGiveaway = {
            id: Date.now(),
            name,
            description,
            duration,
            requirement,
            chatCommand,
            chatUrl,
            startTime: new Date(),
            endTime: new Date(Date.now() + duration * 60000),
            participants: [],
            winner: null,
            isActive: true,
            lastChecked: 0
        };

        this.giveaways.push(newGiveaway);
        this.saveGiveaways();
        this.renderGiveaways();
        this.switchTab('active');
        this.startChatMonitoring(newGiveaway.id);

        setTimeout(() => this.endGiveaway(newGiveaway.id), duration * 60000);
        this.resetForm();
    }

    startChatMonitoring(giveawayId) {
        if (this.chatInterval) clearInterval(this.chatInterval);

        this.chatInterval = setInterval(async () => {
            const giveaway = this.giveaways.find(g => g.id === giveawayId);
            if (!giveaway || !giveaway.isActive) {
                clearInterval(this.chatInterval);
                return;
            }

            try {
                // Pobierz ostatnie wiadomości z czatu
                const response = await fetch(`https://api.ivr.fi/v2/twitch/chat/${giveaway.chatUrl.split('/')[4]}`);
                const chatData = await response.json();
                
                // Filtruj tylko nowe wiadomości
                const newMessages = chatData.messages.filter(msg => 
                    msg.timestamp > giveaway.lastChecked && 
                    msg.message.toLowerCase() === giveaway.chatCommand
                );

                // Sprawdź subskrypcje i dodaj uczestników
                newMessages.forEach(msg => {
                    const username = msg.displayName || msg.user;
                    if (!giveaway.participants.includes(username)) {
                        // Sprawdź czy spełnia wymagania subskrypcji
                        if (this.checkSubscription(msg, giveaway.requirement)) {
                            giveaway.participants.push(username);
                        }
                    }
                });

                giveaway.lastChecked = Math.max(...chatData.messages.map(m => m.timestamp), giveaway.lastChecked);
                this.saveGiveaways();
                this.renderGiveaways();

            } catch (error) {
                console.error('Błąd pobierania czatu:', error);
            }
        }, 5000);
    }

    checkSubscription(msg, requirement) {
        if (requirement === 'all') return true;
        
        const requiredMonths = parseInt(requirement);
        const subscriberBadge = msg.badges?.find(b => b.id === 'subscriber' || b.id === 'founder');
        
        if (!subscriberBadge) return false;
        
        // Dla subów bez określonego czasu (nowi subskrybenci)
        if (!subscriberBadge.months) return requiredMonths <= 1;
        
        return subscriberBadge.months >= requiredMonths;
    }

    endGiveaway(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;

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

    renderGiveaways() {
        this.elements.activeGiveaways.innerHTML = '';
        this.elements.completedGiveaways.innerHTML = '';

        this.giveaways.forEach(giveaway => {
            const element = document.createElement('div');
            element.className = 'giveaway-item';
            element.innerHTML = `
                <h3>${giveaway.name}</h3>
                <p>${giveaway.description}</p>
                <div class="requirements">
                    Wymagania: ${giveaway.requirement === 'all' ? 'Wszyscy' : `Sub ${giveaway.requirement}+`}
                    <span class="command-indicator">Komenda: ${giveaway.chatCommand}</span>
                </div>
                <p>Uczestnicy: ${giveaway.participants.length}</p>
                ${giveaway.isActive ? `
                    <div class="timer">Kończy się: ${new Date(giveaway.endTime).toLocaleTimeString()}</div>
                    <button class="danger-btn" data-id="${giveaway.id}">Zakończ</button>
                    <div class="participant-list">
                        Ostatni uczestnicy: ${giveaway.participants.slice(-3).join(', ')}
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

        // Dodaj event listeners do przycisków
        document.querySelectorAll('.danger-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('Na pewno zakończyć losowanie?')) {
                    this.endGiveaway(parseInt(e.target.dataset.id));
                }
            });
        });
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
            this.giveaways.filter(g => g.isActive).forEach(g => {
                if (new Date() >= g.endTime) {
                    this.endGiveaway(g.id);
                }
            });
        }, 1000);
    }

    resetForm() {
        this.elements.giveawayName.value = '';
        this.elements.giveawayDescription.value = '';
        this.elements.chatCommand.value = '';
        this.elements.chatUrl.value = '';
    }
}

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
    new TwitchGiveaway();
});
