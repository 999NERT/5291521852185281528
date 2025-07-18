document.addEventListener('DOMContentLoaded', function() {
    // Elementy DOM
    const startButton = document.getElementById('start-giveaway');
    const activeGiveawaysContainer = document.getElementById('active-giveaways');
    const completedGiveawaysContainer = document.getElementById('completed-giveaways');
    const requirementButtons = document.querySelectorAll('.req-btn');
    const selectedRequirementInput = document.getElementById('selected-requirement');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Dane aplikacji
    let giveaways = JSON.parse(localStorage.getItem('twitchSubGiveaways')) || [];
    let chatInterval = null;
    
    // Inicjalizacja
    renderGiveaways();
    setupEventListeners();
    startTimerUpdates();
    
    function setupEventListeners() {
        // Przycisk rozpoczęcia losowania
        startButton.addEventListener('click', startNewGiveaway);
        
        // Przyciski wymagań
        requirementButtons.forEach(button => {
            button.addEventListener('click', () => {
                requirementButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedRequirementInput.value = button.dataset.req;
            });
        });
        
        // Zakładki
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });
    }
    
    function startNewGiveaway() {
        const name = document.getElementById('giveaway-name').value.trim();
        const description = document.getElementById('giveaway-description').value.trim();
        const duration = parseInt(document.getElementById('giveaway-duration').value);
        const chatUrl = document.getElementById('chat-url').value.trim();
        const requirement = selectedRequirementInput.value;
        
        // Walidacja
        if (!name) {
            alert('Proszę podać nazwę losowania');
            return;
        }
        
        if (!chatUrl || !chatUrl.includes('twitch.tv/popout')) {
            alert('Proszę podać poprawny URL czatu Twitch w formacie popout');
            return;
        }
        
        // Tworzenie nowego losowania
        const newGiveaway = {
            id: Date.now(),
            name: name,
            description: description,
            duration: duration,
            requirement: requirement,
            chatUrl: chatUrl,
            startTime: new Date(),
            endTime: new Date(Date.now() + duration * 60000),
            participants: [],
            winner: null,
            isActive: true,
            lastChecked: null
        };
        
        giveaways.push(newGiveaway);
        saveGiveaways();
        renderGiveaways();
        switchTab('active');
        
        // Rozpoczęcie monitorowania czatu
        startChatMonitoring(newGiveaway.id);
        
        // Automatyczne zakończenie po upływie czasu
        setTimeout(() => {
            endGiveaway(newGiveaway.id);
        }, duration * 60000);
        
        // Reset formularza
        document.getElementById('giveaway-name').value = '';
        document.getElementById('giveaway-description').value = '';
        document.getElementById('chat-url').value = '';
    }
    
    function startChatMonitoring(giveawayId) {
        const giveaway = giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        // Sprawdzanie czatu co 5 sekund
        if (chatInterval) clearInterval(chatInterval);
        
        chatInterval = setInterval(() => {
            const currentGiveaway = giveaways.find(g => g.id === giveawayId);
            if (!currentGiveaway || !currentGiveaway.isActive) {
                clearInterval(chatInterval);
                return;
            }
            
            checkChatForParticipants(giveawayId);
        }, 5000);
    }
    
    function checkChatForParticipants(giveawayId) {
        const giveaway = giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        try {
            // Pobieranie ramki czatu
            const iframe = document.createElement('iframe');
            iframe.src = giveaway.chatUrl;
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            // Czekanie na załadowanie iframe
            iframe.onload = function() {
                try {
                    const chatDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const chatLines = chatDoc.querySelectorAll('.chat-line__message');
                    
                    chatLines.forEach(line => {
                        // Pomijanie już sprawdzonych wiadomości
                        const timestamp = line.getAttribute('data-timestamp');
                        if (timestamp && giveaway.lastChecked && parseInt(timestamp) <= giveaway.lastChecked) {
                            return;
                        }
                        
                        // Znajdź nazwę użytkownika
                        const usernameElement = line.querySelector('.chat-author__display-name');
                        if (!usernameElement) return;
                        
                        const username = usernameElement.textContent.trim();
                        
                        // Sprawdź czy użytkownik spełnia wymagania
                        let qualifies = false;
                        
                        if (giveaway.requirement === 'all') {
                            qualifies = true;
                        } else {
                            // Sprawdź odpowiednią ikonę suba
                            const badges = line.querySelectorAll('.chat-badge');
                            const requiredIcon = `${giveaway.requirement}.png`;
                            
                            qualifies = Array.from(badges).some(badge => {
                                const img = badge.querySelector('img');
                                return img && img.src.includes(requiredIcon);
                            });
                            
                            // Dla wyższych subów, sprawdzaj też wyższe tiery
                            if (!qualifies && giveaway.requirement !== '3') {
                                const reqNum = parseInt(giveaway.requirement);
                                qualifies = Array.from(badges).some(badge => {
                                    const img = badge.querySelector('img');
                                    if (!img) return false;
                                    
                                    // Sprawdzanie czy użytkownik ma wyższy sub niż wymagany
                                    const iconSrc = img.src;
                                    const matches = iconSrc.match(/(\d+)\.png/);
                                    if (matches && matches[1]) {
                                        const subMonths = parseInt(matches[1]);
                                        return subMonths >= reqNum;
                                    }
                                    return false;
                                });
                            }
                        }
                        
                        if (qualifies && !giveaway.participants.includes(username)) {
                            giveaway.participants.push(username);
                            saveGiveaways();
                            renderGiveaways();
                        }
                        
                        // Aktualizacja ostatniego sprawdzonego timestampu
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
    
    function endGiveaway(giveawayId) {
        const giveawayIndex = giveaways.findIndex(g => g.id === giveawayId);
        if (giveawayIndex === -1) return;
        
        const giveaway = giveaways[giveawayIndex];
        
        // Losowanie zwycięzcy
        if (giveaway.participants.length > 0) {
            const randomIndex = Math.floor(Math.random() * giveaway.participants.length);
            giveaway.winner = giveaway.participants[randomIndex];
        }
        
        giveaway.isActive = false;
        giveaways[giveawayIndex] = giveaway;
        saveGiveaways();
        renderGiveaways();
        
        // Wyświetl powiadomienie o zwycięzcy
        if (giveaway.winner) {
            alert(`Losowanie "${giveaway.name}" zakończone! Zwycięzca: ${giveaway.winner}`);
        } else {
            alert(`Losowanie "${giveaway.name}" zakończone. Brak kwalifikujących się uczestników.`);
        }
    }
    
    function renderGiveaways() {
        activeGiveawaysContainer.innerHTML = '';
        completedGiveawaysContainer.innerHTML = '';
        
        giveaways.forEach(giveaway => {
            const giveawayElement = document.createElement('div');
            giveawayElement.className = 'giveaway-item';
            
            // Oblicz pozostały czas
            let timeLeft = '';
            if (giveaway.isActive) {
                const diff = giveaway.endTime - new Date();
                if (diff > 0) {
                    const minutes = Math.floor(diff / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    timeLeft = `<div class="timer">Kończy się za: ${minutes}m ${seconds}s</div>`;
                }
            }
            
            // Ikona wymagania
            let requirementIcon = '';
            if (giveaway.requirement !== 'all') {
                requirementIcon = `<img src="icons/${giveaway.requirement}.png" class="badge-icon" alt="${giveaway.requirement} months">`;
            }
            
            giveawayElement.innerHTML = `
                <h3>${giveaway.name}</h3>
                <p>${giveaway.description}</p>
                <div class="requirements">
                    Wymagania: ${requirementIcon}
                    ${giveaway.requirement === 'all' ? 'Wszyscy w czacie' : `Sub ${giveaway.requirement}+ miesięcy`}
                </div>
                <p>Czas trwania: ${giveaway.duration} minut</p>
                <p class="participants-count">Uczestnicy: ${giveaway.participants.length}</p>
                ${timeLeft}
                ${giveaway.isActive ? 
                    `<button class="danger-btn" data-giveaway-id="${giveaway.id}">Zakończ wcześniej</button>` : 
                    `<p>Zakończono: ${new Date(giveaway.endTime).toLocaleString()}</p>`}
                ${giveaway.winner ? `<div class="winner">🏆 Zwycięzca: ${giveaway.winner} 🏆</div>` : 
                 !giveaway.isActive && giveaway.participants.length === 0 ? '<div class="winner">Brak kwalifikujących się uczestników</div>' : ''}
                ${giveaway.isActive ? `<button class="secondary-btn show-participants" data-giveaway-id="${giveaway.id}">Pokaż uczestników</button>` : ''}
            `;
            
            if (giveaway.isActive) {
                activeGiveawaysContainer.appendChild(giveawayElement);
            } else {
                completedGiveawaysContainer.appendChild(giveawayElement);
            }
        });
        
        // Dodanie event listenerów do nowo utworzonych przycisków
        document.querySelectorAll('.danger-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const giveawayId = parseInt(e.target.dataset.giveawayId);
                manualEndGiveaway(giveawayId);
            });
        });
        
        document.querySelectorAll('.show-participants').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const giveawayId = parseInt(e.target.dataset.giveawayId);
                showParticipants(giveawayId);
            });
        });
    }
    
    function manualEndGiveaway(giveawayId) {
        if (confirm('Czy na pewno chcesz zakończyć to losowanie wcześniej?')) {
            endGiveaway(giveawayId);
        }
    }
    
    function showParticipants(giveawayId) {
        const giveaway = giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return;
        
        alert(`Uczestnicy losowania "${giveaway.name}":\n\n${giveaway.participants.join('\n') || 'Brak uczestników'}`);
    }
    
    function switchTab(tabName) {
        // Aktualizacja zakładek
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Aktualizacja zawartości
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }
    
    function startTimerUpdates() {
        // Aktualizacja timerów co sekundę
        setInterval(() => {
            const activeElements = document.querySelectorAll('.timer');
            if (activeElements.length > 0) {
                renderGiveaways();
            }
        }, 1000);
    }
    
    function saveGiveaways() {
        localStorage.setItem('twitchSubGiveaways', JSON.stringify(giveaways));
    }
    
    // Ustaw pierwszy przycisk wymagań jako aktywny
    document.querySelector('.req-btn[data-req="all"]').classList.add('active');
});
