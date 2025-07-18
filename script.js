class TwitchGiveaway {
    constructor() {
        this.giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
        this.chatInterval = null;
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
    
    startNewGiveaway() {
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
    
    async startChatMonitoring(giveawayId) {
        if (this.chatInterval) clearInterval(this.chatInterval);
        
        this.chatInterval = setInterval(async () => {
            const giveaway = this.giveaways.find(g => g.id === giveawayId);
            if (!giveaway || !giveaway.isActive) {
                clearInterval(this.chatInterval);
                return;
            }
            
            try {
                const response = await fetch(`https://tmi.twitch.tv/group/user/${giveaway.channelName}/chatters`);
                const data = await response.json();
                
                // Symulacja wykrywania subskrypcji (w rzeczywistości potrzebne byłoby API Twitch)
                const allUsers = [
                    ...data.chatters.moderators,
                    ...data.chatters.vips,
                    ...data.chatters.viewers
                ];
                
                // Symulacja wykrywania komendy - w rzeczywistości trzeba by pobrać historię czatu
                allUsers.forEach(user => {
                    if (!giveaway.participants.includes(user)) {
                        // Symulacja spełnienia wymagań
                        const meetsRequirements = 
                            (giveaway.requirement === 'all') || 
                            (Math.random() > 0.5); // W rzeczywistości sprawdzać subskrypcje
                            
                        if (meetsRequirements) {
                            giveaway.participants.push(user);
                        }
                    }
                });
                
                this.saveGiveaways();
                this.renderGiveaways();
                
            } catch (error) {
                console.error('Błąd pobierania czatu:', error);
            }
        }, 5000);
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
            const timeLeft = this.getTimeLeft(giveaway);
            const requirementText = giveaway.requirement === 'all' ? 'Wszyscy' : `Sub ${giveaway.requirement}+`;
            
            const element = document.createElement('div');
            element.className = 'giveaway-item';
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
                        Ostatni uczestnicy: ${giveaway.participants.slice(-3).join(', ') || 'Brak'}
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
        
        document.querySelectorAll('.danger-btn').forEach(btn => {
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

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
    new TwitchGiveaway();
});
