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
        this.setDefaultRequirement();
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
            button.addEventListener('click', () => this.selectRequirement(button));
        });
        
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    }
    
    selectRequirement(button) {
        this.elements.requirementButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.elements.selectedRequirement.value = button.dataset.req;
    }
    
    setDefaultRequirement() {
        const defaultBtn = document.querySelector('.req-btn[data-req="all"]');
        if (defaultBtn) defaultBtn.classList.add('active');
    }
    
    startNewGiveaway() {
        const name = this.elements.giveawayName.value.trim();
        const description = this.elements.giveawayDescription.value.trim();
        const duration = parseInt(this.elements.giveawayDuration.value);
        const chatUrl = this.elements.chatUrl.value.trim();
        const requirement = this.elements.selectedRequirement.value;
        const chatCommand = this.elements.chatCommand.value.trim();
        
        if (!this.validateInputs(name, chatUrl)) return;
        
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
            lastChecked: null
        };
        
        this.giveaways.push(newGiveaway);
        this.saveGiveaways();
        this.renderGiveaways();
        this.switchTab('active');
        this.startChatMonitoring(newGiveaway.id);
        
        setTimeout(() => this.endGiveaway(newGiveaway.id), duration * 60000);
        this.resetForm();
    }
    
    validateInputs(name, chatUrl) {
        if (!name) {
            alert('Proszę podać nazwę losowania');
            return false;
        }
        
        if (!chatUrl || !chatUrl.includes('twitch.tv/popout')) {
            alert('Proszę podać poprawny URL czatu Twitch w formacie popout');
            return false;
        }
        
        return true;
    }
    
    resetForm() {
        this.elements.giveawayName.value = '';
        this.elements.giveawayDescription.value = '';
        this.elements.chatUrl.value = '';
        this.elements.chatCommand.value = '';
    }
    
    startChatMonitoring(giveawayId) {
        if (this.chatInterval) clearInterval(this.chatInterval);
        
        this.chatInterval = setInterval(() => {
            const giveaway = this.giveaways.find(g => g.id === giveawayId);
            if (!giveaway || !giveaway.isActive) {
                clearInterval(this.chatInterval);
                return;
            }
            
            this.checkChatForParticipants(giveawayId);
        }, 5000);
    }
    
    checkChatForParticipants(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        try {
            const iframe = document.createElement('iframe');
            iframe.src = giveaway.chatUrl;
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            iframe.onload = () => {
                try {
                    const chatDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const chatLines = chatDoc.querySelectorAll('.chat-line__message');
                    
                    chatLines.forEach(line => {
                        const timestamp = line.getAttribute('data-timestamp');
                        if (timestamp && giveaway.lastChecked && parseInt(timestamp) <= giveaway.lastChecked) return;
                        
                        const usernameElement = line.querySelector('.chat-author__display-name');
                        if (!usernameElement) return;
                        
                        const username = usernameElement.textContent.trim();
                        
                        // Sprawdzenie komendy
                        const commandValid = this.checkCommand(line, giveaway.chatCommand);
                        // Sprawdzenie subskrypcji
                        const subValid = this.checkSubscription(line, giveaway.requirement);
                        
                        if (commandValid && subValid && !giveaway.participants.includes(username)) {
                            giveaway.participants.push(username);
                            this.saveGiveaways();
                            this.renderGiveaways();
                        }
                        
                        if (timestamp) {
                            giveaway.lastChecked = Math.max(giveaway.lastChecked || 0, parseInt(timestamp));
                        }
                    });
                } catch (e) {
                    console.error('Błąd analizy czatu:', e);
                } finally {
                    document.body.removeChild(iframe);
                }
            };
        } catch (e) {
            console.error('Błąd dostępu do czatu:', e);
        }
    }
    
    checkCommand(line, requiredCommand) {
        if (!requiredCommand) return true;
        
        const messageElement = line.querySelector('.text-fragment');
        if (!messageElement) return false;
        
        const message = messageElement.textContent.trim();
        return message.toLowerCase() === requiredCommand.toLowerCase();
    }
    
    checkSubscription(line, requirement) {
        if (requirement === 'all') return true;
        
        const badges = line.querySelectorAll('.chat-badge');
        const requiredMonths = parseInt(requirement);
        
        return Array.from(badges).some(badge => {
            const img = badge.querySelector('img');
            if (!img) return false;
            
            const matches = img.src.match(/(\d+)\.png/);
            if (!matches || !matches[1]) return false;
            
            const subMonths = parseInt(matches[1]);
            return subMonths >= requiredMonths;
        });
    }
    
    endGiveaway(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        if (giveaway.participants.length > 0) {
            const randomIndex = Math.floor(Math.random() * giveaway.participants.length);
            giveaway.winner = giveaway.participants[randomIndex];
        }
        
        giveaway.isActive = false;
        this.saveGiveaways();
        this.renderGiveaways();
        
        this.showWinnerAlert(giveaway);
    }
    
    showWinnerAlert(giveaway) {
        if (giveaway.winner) {
            alert(`Losowanie "${giveaway.name}" zakończone!\nZwycięzca: ${giveaway.winner}`);
        } else {
            alert(`Losowanie "${giveaway.name}" zakończone.\nBrak kwalifikujących się uczestników.`);
        }
    }
    
    renderGiveaways() {
        this.elements.activeGiveaways.innerHTML = '';
        this.elements.completedGiveaways.innerHTML = '';
        
        this.giveaways.forEach(giveaway => {
            const element = this.createGiveawayElement(giveaway);
            
            if (giveaway.isActive) {
                this.elements.activeGiveaways.appendChild(element);
            } else {
                this.elements.completedGiveaways.appendChild(element);
            }
        });
        
        this.setupDynamicButtons();
    }
    
    createGiveawayElement(giveaway) {
        const element = document.createElement('div');
        element.className = 'giveaway-item';
        element.innerHTML = this.getGiveawayHTML(giveaway);
        return element;
    }
    
    getGiveawayHTML(giveaway) {
        const timeLeft = this.getTimeLeft(giveaway);
        const requirementIcon = giveaway.requirement !== 'all' ? 
            `<img src="icons/${giveaway.requirement}.png" class="badge-icon" alt="${giveaway.requirement} months">` : '';
        const commandInfo = giveaway.chatCommand ? 
            `<span class="command-indicator">Komenda: ${giveaway.chatCommand}</span>` : '';
        const winnerInfo = this.getWinnerInfo(giveaway);
        
        return `
            <h3>${giveaway.name}</h3>
            <p>${giveaway.description}</p>
            <div class="requirements">
                Wymagania: ${requirementIcon}
                ${giveaway.requirement === 'all' ? 'Wszyscy w czacie' : `Sub ${giveaway.requirement}+ miesięcy`}
                ${commandInfo}
            </div>
            <p>Czas trwania: ${giveaway.duration} minut</p>
            <p class="participants-count">Uczestnicy: ${giveaway.participants.length}</p>
            ${timeLeft}
            ${giveaway.isActive ? 
                `<button class="danger-btn" data-giveaway-id="${giveaway.id}">Zakończ wcześniej</button>` : 
                `<p>Zakończono: ${new Date(giveaway.endTime).toLocaleString()}</p>`}
            ${winnerInfo}
            ${giveaway.isActive ? 
                `<button class="secondary-btn show-participants" data-giveaway-id="${giveaway.id}">Pokaż uczestników</button>` : ''}
        `;
    }
    
    getTimeLeft(giveaway) {
        if (!giveaway.isActive) return '';
        
        const diff = giveaway.endTime - new Date();
        if (diff <= 0) return '';
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `<div class="timer">Kończy się za: ${minutes}m ${seconds}s</div>`;
    }
    
    getWinnerInfo(giveaway) {
        if (giveaway.winner) {
            return `<div class="winner">🏆 Zwycięzca: ${giveaway.winner} 🏆</div>`;
        }
        
        if (!giveaway.isActive && giveaway.participants.length === 0) {
            return '<div class="winner">Brak kwalifikujących się uczestników</div>';
        }
        
        return '';
    }
    
    setupDynamicButtons() {
        document.querySelectorAll('.danger-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const giveawayId = parseInt(e.target.dataset.giveawayId);
                if (confirm('Czy na pewno chcesz zakończyć to losowanie wcześniej?')) {
                    this.endGiveaway(giveawayId);
                }
            });
        });
        
        document.querySelectorAll('.show-participants').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const giveawayId = parseInt(e.target.dataset.giveawayId);
                this.showParticipants(giveawayId);
            });
        });
    }
    
    showParticipants(giveawayId) {
        const giveaway = this.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        alert(`Uczestnicy losowania "${giveaway.name}":\n\n${giveaway.participants.join('\n') || 'Brak uczestników'}`);
    }
    
    switchTab(tabName) {
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        this.elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }
    
    startTimerUpdates() {
        setInterval(() => {
            if (document.querySelectorAll('.timer').length > 0) {
                this.renderGiveaways();
            }
        }, 1000);
    }
    
    saveGiveaways() {
        localStorage.setItem('twitchSubGiveaways', JSON.stringify(this.giveaways));
    }
}

// Inicjalizacja aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    new TwitchGiveaway();
});
