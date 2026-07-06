// Using Chrome API

import { applyTranslations, fmt, getLanguage, t, type PopupTranslations } from './i18n.js';

// Dictionnaire actif (même clé de langue persistée que le popup principal).
let T: PopupTranslations = t('en');

function pendingLabel(count: number): string {
  return fmt(count > 1 ? T.suggestions.pendingMany : T.suggestions.pendingOne, { n: count });
}

interface Suggestion {
  id: number;
  contact_username: string;
  from_category: string;
  to_category: string;
  score: number;
  confidence: number;
  reason: string;
  evidence: string;
  status: string;
  created_at: string;
}

async function loadSuggestions() {
  const loading = document.getElementById('loading')!;
  const content = document.getElementById('content')!;
  const emptyState = document.getElementById('empty-state')!;
  const suggestionsList = document.getElementById('suggestions-list')!;
  const countText = document.getElementById('count-text')!;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SUGGESTIONS' });

    loading.style.display = 'none';
    content.style.display = 'block';

    if (!(response as any).success || !(response as any).suggestions || (response as any).suggestions.length === 0) {
      emptyState.style.display = 'block';
      suggestionsList.style.display = 'none';
      countText.textContent = pendingLabel(0);
      return;
    }

    const suggestions: Suggestion[] = (response as any).suggestions;
    const pendingCount = suggestions.filter(s => s.status === 'pending').length;

    countText.textContent = pendingLabel(pendingCount);

    suggestionsList.innerHTML = '';
    emptyState.style.display = 'none';
    suggestionsList.style.display = 'flex';

    suggestions.forEach(suggestion => {
      if (suggestion.status === 'pending') {
        const card = createSuggestionCard(suggestion);
        suggestionsList.appendChild(card);
      }
    });

  } catch (error) {
    console.error('Error loading suggestions:', error);
    loading.style.display = 'none';
    content.style.display = 'block';
    emptyState.style.display = 'block';
    suggestionsList.style.display = 'none';
  }
}

function createSuggestionCard(suggestion: Suggestion): HTMLElement {
  const card = document.createElement('div');
  card.className = 'suggestion-card';

  const emoji = getCategoryEmoji(suggestion.to_category);
  const evidence = parseEvidence(suggestion.evidence);

  card.innerHTML = `
    <div class="suggestion-header">
      <div class="username">${emoji} @${suggestion.contact_username}</div>
      <div class="score-badge">${suggestion.score}/100</div>
    </div>
    
    <div class="transition">
      <span class="category-badge category-${suggestion.from_category}">${suggestion.from_category}</span>
      <span class="transition-arrow">→</span>
      <span class="category-badge category-${suggestion.to_category}">${suggestion.to_category}</span>
    </div>
    
    <div class="reason">📝 ${suggestion.reason}</div>
    
    ${evidence.length > 0 ? `
      <div class="evidence">
        ${T.suggestions.evidence}
        ${evidence.map(e => `<div class="evidence-item">• ${e}</div>`).join('')}
      </div>
    ` : ''}
    
    <div class="actions">
      <button class="btn btn-accept" data-id="${suggestion.id}">${T.suggestions.accept}</button>
      <button class="btn btn-reject" data-id="${suggestion.id}">${T.suggestions.reject}</button>
    </div>
  `;

  // Ajouter les event listeners
  const acceptBtn = card.querySelector('.btn-accept') as HTMLButtonElement;
  const rejectBtn = card.querySelector('.btn-reject') as HTMLButtonElement;

  acceptBtn.addEventListener('click', () => handleAccept(suggestion.id, card));
  rejectBtn.addEventListener('click', () => handleReject(suggestion.id, card));

  return card;
}

async function handleAccept(suggestionId: number, card: HTMLElement) {
  try {
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';

    const response = await chrome.runtime.sendMessage({
      type: 'ACCEPT_SUGGESTION',
      suggestionId
    });

    if ((response as any).success) {
      card.style.background = 'rgba(76, 175, 80, 0.3)';
      setTimeout(() => {
        card.remove();
        updateCount();
      }, 500);
    } else {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
      alert(T.suggestions.errorAccepting);
    }
  } catch (error) {
    console.error('Error accepting suggestion:', error);
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
    alert(T.suggestions.errorAccepting);
  }
}

async function handleReject(suggestionId: number, card: HTMLElement) {
  const reason = prompt(T.suggestions.rejectReasonPrompt);

  try {
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';

    const response = await chrome.runtime.sendMessage({
      type: 'REJECT_SUGGESTION',
      suggestionId,
      reason
    });

    if ((response as any).success) {
      card.style.background = 'rgba(244, 67, 54, 0.3)';
      setTimeout(() => {
        card.remove();
        updateCount();
      }, 500);
    } else {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
      alert(T.suggestions.errorRejecting);
    }
  } catch (error) {
    console.error('Error rejecting suggestion:', error);
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
    alert(T.suggestions.errorRejecting);
  }
}

function updateCount() {
  const suggestionsList = document.getElementById('suggestions-list')!;
  const emptyState = document.getElementById('empty-state')!;
  const countText = document.getElementById('count-text')!;

  const remainingCards = suggestionsList.querySelectorAll('.suggestion-card').length;

  countText.textContent = pendingLabel(remainingCards);

  if (remainingCards === 0) {
    emptyState.style.display = 'block';
    suggestionsList.style.display = 'none';
  }
}

function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    lead: '🆕',
    prospect: '📊',
    client: '🎉',
    network: '🤝'
  };
  return emojis[category] || '📋';
}

function parseEvidence(evidence: string): string[] {
  try {
    const parsed = JSON.parse(evidence);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Event listeners
document.getElementById('back-btn')?.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Charger la langue persistée, traduire le DOM statique, puis charger les
// suggestions (les cartes rendues ensuite utilisent le même dictionnaire T).
async function initSuggestionsPage() {
  const lang = await getLanguage();
  T = t(lang);
  document.documentElement.lang = lang;
  applyTranslations(T);

  await loadSuggestions();

  // Rafraîchir toutes les 30 secondes
  setInterval(loadSuggestions, 30000);
}

initSuggestionsPage();


