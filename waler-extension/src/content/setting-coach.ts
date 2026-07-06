/**
 * Setting Coach
 *
 * Aligne les conseils sur la méthodologie de « setting » (qualification en DM) :
 *
 *   1. Connexion  → identifier l'OBJECTIF ou le PROBLÈME (pourquoi il est là)
 *   2. Situation  → comprendre ce qu'il fait actuellement (job / activité / CA)
 *   3. Problème   → creuser les CONSÉQUENCES / la douleur
 *   4. Transition → proposer le call
 *
 * Le branchement « a déjà une activité » (toutes niches : freelance, agence,
 * boutique, coaching, SaaS…) adapte les questions de Situation/Problème.
 *
 * On déduit la phase courante du CONTENU des messages reçus (ce que le prospect
 * a déjà révélé), puis on propose la prochaine question à poser. Purement
 * heuristique (lexique FR), aucune IA — complémentaire de l'axe « température »
 * (comportemental) et de DMAnalyzer (intention).
 */

import type { ExtractedMessage } from './dm-message-extractor.js';
import type { ConversationDynamics } from './conversation-dynamics.js';

export type SettingPhase = 'connexion' | 'situation' | 'probleme' | 'transition';
export type EmotionalState = 'hot' | 'neutral' | 'cold' | 'skeptical';
export type Lang = 'fr' | 'en';
// Élan de la conversation, fusionné depuis la dynamique comportementale.
export type Momentum = 'accelerating' | 'steady' | 'cooling';
// Mode d'action prioritaire déduit par le moteur (machine à états du setting).
export type Priority = 'qualify' | 'close' | 'reengage' | 'nurture';

const COACH_HOUR = 60 * 60 * 1000;
const COACH_DAY = 24 * COACH_HOUR;

// Faits clés extraits des messages DU PROSPECT (best-effort, heuristique FR).
export interface ConversationFacts {
  budget: string | null; // ce qu'il peut/a investir (ex: « il me reste 280 euros »)
  timeline: string | null; // horizon / deadline (ex: « 4-5 mois »)
  goal: string | null; // objectif chiffré (ex: « 500 euros » de MRR)
  activity: string | null; // type d'activité détecté (ex: « SaaS / logiciel »)
  objections: string[]; // freins exprimés (ex: « Budget limité »)
}

// Ce que le prospect a révélé jusqu'ici (axes de qualification).
export interface SettingRevealed {
  objective: boolean; // il a exprimé un objectif / ce qu'il cherche
  situation: boolean; // il a décrit son activité / sa situation
  pain: boolean; // il a exprimé une douleur / des conséquences
}

// Synthèse structurée du « setting » : ce qu'on sait, ce qu'il reste à creuser.
export interface SettingSummary {
  nextStep: string; // la prochaine action/question conseillée
  revealed: SettingRevealed;
  missing: string[]; // axes encore à qualifier
  facts: ConversationFacts;
  // Readiness au closing (0-100) tirée du framework de setting : plus le prospect
  // a révélé situation actuelle / désirée / blocages + budget + signaux d'achat,
  // plus il est prêt à acheter.
  qualificationScore: number;
  // Offre à pousser selon le profil (low-ticket pour débutant/petit budget,
  // call coaching s'il a déjà une activité). Texte localisé, null si trop tôt.
  recommendedOffer: string | null;
  // Tactique de closing prioritaire (urgence si chaud mais temporise, preuve si
  // sceptique…). Texte localisé, null si rien de saillant.
  closingTactic: string | null;
  // Prédiction : probabilité de closer (0-100), fusion qualification + momentum +
  // état émotionnel + signaux comportementaux.
  closeProbability: number;
  // Élan de la conversation (depuis la dynamique : cadence, vitesse, récence).
  momentum: Momentum;
  // Mode d'action prioritaire : qualifier / closer / réengager / entretenir.
  priority: Priority;
}

export interface SettingCoaching {
  phase: SettingPhase;
  phaseLabel: string;
  lang: Lang;                   // langue détectée des messages du prospect (FR/EN)
  hasBusiness: boolean;         // a déjà une activité à scaler → adapte les questions
  nextStep: string;             // la prochaine action/question conseillée
  summary: SettingSummary;      // synthèse structurée (révélé / manquant / faits)
  // §7 signals
  buyingSignal: boolean;        // prospect asks price / start / usage / guarantee questions
  emotionalState: EmotionalState;
  authorityConfirmed: boolean;  // prospect is the sole decision-maker
  authorityBlocked: boolean;    // prospect needs to check with someone else
  hasCooling: boolean;          // conversation is cooling / prospect is pulling away
}

// Types d'activité reconnus (libellé EN/FR affiché → mots-clés normalisés sans accent).
const ACTIVITY_TYPES: Array<{ label: string; labelFr: string; kws: string[] }> = [
  { label: 'SaaS / software', labelFr: 'SaaS / logiciel', kws: ['saas', 'logiciel', 'mon app', 'application', 'extension', 'plateforme', 'abonnes', 'suivi des abonnes', 'software', 'my app', 'platform', 'subscribers'] },
  { label: 'E-commerce', labelFr: 'E-commerce', kws: ['ecommerce', 'e-commerce', 'boutique', 'shop', 'dropshipping', 'dropship', 'shopify', 'fba', 'print on demand', 'store', 'my store', 'my shop', 'online store'] },
  { label: 'Agency / SMMA', labelFr: 'Agence / SMMA', kws: ['agence', 'smma', 'studio', 'agency', 'my agency'] },
  { label: 'Coaching / courses', labelFr: 'Coaching / formations', kws: ['coaching', 'coach', 'mentorat', 'mentor', 'infopreneur', 'formation en ligne', 'formateur', 'online course', 'course creator', 'courses'] },
  { label: 'Freelance / services', labelFr: 'Freelance / services', kws: ['freelance', 'consultant', 'consulting', 'copywriter', 'closer', 'setter', 'ugc', 'monteur', 'graphiste', 'designer', 'developpeur', 'freelancer', 'developer', 'video editor', 'designer'] },
  { label: 'Trading / crypto', labelFr: 'Trading / crypto', kws: ['trading', 'trader', 'crypto', 'forex'] },
  { label: 'Content / creator', labelFr: 'Créateur de contenu', kws: ['createur de contenu', 'créateur de contenu', 'influenceur', 'influenceuse', 'newsletter', 'chaine youtube', 'content creator', 'creator', 'youtuber', 'tiktoker', 'streamer', 'influencer', 'my channel', 'my page'] },
  { label: 'Fitness / coaching sportif', labelFr: 'Fitness / coaching sportif', kws: ['coach sportif', 'fitness', 'nutrition', 'salle de sport', 'personal trainer', 'fitness coach', 'gym', 'workout', 'wellness', 'musculation', 'muscu', 'prep physique', 'dieteticien', 'dietetique', 'yoga', 'pilates'] },
  { label: 'Real estate', labelFr: 'Immobilier', kws: ['immobilier', 'agent immobilier', 'real estate', 'realtor', 'property', 'properties', 'investissement locatif', 'locatif', 'lcd', 'airbnb', 'marchand de biens'] },
  { label: 'Beauty / esthetics', labelFr: 'Beauté / esthétique', kws: ['estheticienne', 'esthetique', 'salon de beaute', 'institut', 'onglerie', 'prothesiste ongulaire', 'extension de cils', 'coiffure', 'coiffeur', 'coiffeuse', 'barbier', 'maquilleuse', 'mua', 'tatoueur', 'beauty salon', 'nail tech', 'lash tech', 'hairdresser', 'makeup artist'] },
  { label: 'Food / restaurant', labelFr: 'Restauration / food', kws: ['restaurant', 'mon resto', 'food truck', 'traiteur', 'patisserie', 'boulangerie', 'chef a domicile', 'dark kitchen', 'restauration', 'cafe', 'coffee shop'] },
  { label: 'Health / therapy', labelFr: 'Santé / thérapie', kws: ['therapeute', 'naturopathe', 'sophrologue', 'osteopathe', 'kine', 'kinesitherapeute', 'praticien', 'hypnotherapeute', 'psychologue', 'psy', 'therapist', 'naturopath', 'wellness coach'] },
  { label: 'Music / audio', labelFr: 'Musique / audio', kws: ['beatmaker', 'beat maker', 'producteur', 'prod musicale', 'ingenieur son', 'inge son', 'dj', 'mixage', 'mastering', 'music producer', 'audio engineer', 'mon label'] },
  { label: 'Photo / video', labelFr: 'Photo / vidéo', kws: ['photographe', 'videaste', 'cadreur', 'motion designer', 'montage video', 'photographer', 'videographer', 'filmmaker', 'film maker', 'reels editor'] },
  { label: 'Events / wedding', labelFr: 'Événementiel / mariage', kws: ['wedding planner', 'evenementiel', 'organisateur devenements', 'traiteur evenementiel', 'decoratrice', 'event planner', 'mes events'] },
];

// Freins courants → libellé EN/FR d'objection (mots-clés normalisés sans accent).
const OBJECTION_GROUPS: Array<{ label: string; labelFr: string; kws: string[] }> = [
  { label: 'Limited budget', labelFr: 'Budget limité', kws: ['pas les moyens', 'pas le budget', 'trop cher', 'cest cher', 'pas dargent', 'il me reste', 'me reste plus', 'peux pas financer', 'peux pas me permettre', 'jai pas les moyens', 'cant afford', 'too expensive', 'no money', 'tight budget', 'no budget', 'cest chaud financierement', 'jsuis fauche', 'jsuis a sec', 'fin de mois difficile', 'jai pas un rond', 'pas les fonds', 'ca fait beaucoup', 'cest hors budget', 'jpeux pas mettre autant', 'a court dargent', 'im broke', 'low on cash', 'thats a lot', 'out of my budget', 'cant swing that right now'] },
  { label: 'Already committed elsewhere', labelFr: 'Déjà engagé ailleurs', kws: ['deja une formation', 'deja pris une formation', 'formation en cours', 'jai la formation', 'deja accompagne', 'deja investi', 'jai deja une', 'pris une formation', 'already have a course', 'already enrolled', 'already invested', 'already working with', 'jai deja un mentor', 'jai deja un coach', 'je suis deja accompagne', 'jai deja achete un programme', 'i already have a mentor', 'i already have a coach', 'im already in a program'] },
  { label: 'Stalling', labelFr: 'Temporise', kws: ['je verrai', 'plus tard', 'pas pour linstant', 'pas maintenant', 'on verra', 'je te tiens au courant', 'des que', 'quand jaurai', 'je te dirai', 'later', 'not now', 'not right now', 'maybe later', 'ill let you know', 'well see', 'jverrai ca plus tard', 'pas tout de suite', 'apres les vacances', 'apres les fetes', 'le mois prochain', 'quand jaurai le temps', 'after the holidays', 'next month', 'sometime soon', 'down the road', 'eventually'] },
  { label: 'Lack of means/availability', labelFr: 'Manque de moyens / dispo', kws: ['pas dordi', 'pas encore mon ordi', 'jai pas le temps', 'pas le temps', 'pas dispo', 'pas mon ordi', 'no time', 'dont have time', 'not available', 'no laptop', 'no computer', 'jsuis deborde', 'jai trop de boulot', 'pas de connexion stable', 'jai pas le materiel', 'pas dispo en ce moment', 'im swamped', 'too much on my plate', 'no stable connection', 'i dont have the gear'] },
  // §7.2 additions
  { label: 'Procrastination', labelFr: 'Procrastination', kws: ['je vais reflechir', 'laisse moi y penser', 'je te recontacte', 'je te recontacterai', 'jai besoin de temps', 'je prendrai le temps', 'je vais y reflechir', 'ill think about it', 'let me think about it', 'i need to think', 'ill get back to you', 'ill let you know', 'i need some time', 'give me some time', 'i need time to decide', 'faut que je murisse ca', 'jdois peser le pour et le contre', 'jveux pas me precipiter', 'laisse moi digerer', 'i need to mull it over', 'i dont want to rush', 'let me sleep on it'] },
  { label: 'Trust / proof needed', labelFr: 'Confiance / preuve nécessaire', kws: ['comment je sais que ca marche', 'jai deja ete decu', 'cest du serieux', 'jai peur de me faire avoir', 'arnaque', 'je fais pas confiance', 'prouve moi', 'jai deja ete arnaqu', 'how do i know it works', 'ive been scammed', 'ive been burned before', 'can you prove it', 'show me results', 'show me testimonials', 'is this legit', 'sounds like a scam', 'do you have proof', 'tas des preuves', 'tas des resultats', 'des temoignages', 'des avis', 'cest fiable', 'tes qui exactement', 'ca sent larnaque', 'jme mefie', 'any reviews', 'got testimonials', 'is this real', 'who are you exactly', 'this feels sketchy', 'im skeptical of this'] },
];

// L'utilisateur exprime un objectif ou cherche de l'aide → fin de Connexion.
const OBJECTIVE_KEYWORDS = [
  'je veux', 'je voudrais', 'j\'aimerais', 'jaimerais', 'aimerais', 'j\'ai envie', 'jai envie',
  'objectif', 'mon but', 'besoin', 'j\'ai besoin', 'jai besoin', 'cherche', 'je cherche', 'recherche',
  'aide', 'aider', 'm\'aider', 'comment faire', 'comment tu', 'comment je', 'des conseils', 'un conseil',
  'accompagn', 'me former', 'formation', 'apprendre', 'me lancer', 'lancer mon', 'démarrer', 'demarrer',
  'commencer', 'progresser', 'développer', 'developper', 'scaler', 'scale', 'passer à l\'échelle',
  'générer plus', 'gagner plus', 'augmenter', 'plus de clients', 'plus de ventes', 'monétiser', 'monetiser',
  'want', 'i want', 'i\'d like', 'looking for', 'need', 'help', 'goal', 'interested', 'how do you', 'how to',
  'grow', 'scale', 'get more clients', 'make more',
  // ----- Argot jeune / ambition -----
  'percer', 'je veux percer', 'exploser', 'décoller', 'decoller', 'passer un cap', 'changer de vie',
  'devenir riche', 'liberté financière', 'liberte financiere', 'gratter', 'je veux gratter', 'me lancer dans',
  'me faire des sous', 'me faire de l\'argent', 'gagner ma vie', 'gagner plus', 'faire du cash',
  'faire de la maille', 'faire des thunes', 'wesh tu fais quoi', 'tu peux m\'aider', 'apprends moi',
  'je veux test', 'je veux essayer', 'tenter le truc',
  // ----- English (intent / goal) -----
  'i wanna', 'i want to', 'i would like', 'id like to', 'im trying to', 'trying to', 'i need help',
  'how can i', 'how do i start', 'where do i start', 'get started', 'getting started', 'i want to start',
  'i want to learn', 'teach me', 'show me how', 'any advice', 'some advice', 'any tips', 'some tips',
  'i want to grow', 'grow my', 'scale my', 'level up', 'get more clients', 'land clients', 'close clients',
  'make money', 'make money online', 'making money', 'earn more', 'more income', 'side income',
  'side hustle', 'financial freedom', 'quit my job', 'replace my income', 'build a business', 'start a business',
  'monetize', 'monetise', 'go full time', 'become profitable', 'hit my goal', 'reach my goal',
  // ----- Enrichissement FR (objectif / quête d'aide) -----
  'jaimerais arriver a', 'mon reve cest', 'mon objectif cest', 'jveux atteindre', 'jveux arriver a',
  'comment tu ferais', 'tu conseilles quoi', 'par ou je commence', 'jaimerais ton avis',
  'jcherche une methode', 'jcherche un truc qui marche', 'jveux des resultats', 'jveux que ca marche',
  'jveux vivre de ca', 'jveux en faire mon metier', 'jveux quitter mon taf', 'jveux etre libre',
  // ----- EN -----
  'i\'d love to reach', 'my dream is', 'my goal is', 'i want to hit', 'how would you do it',
  'what do you recommend', 'where should i start', 'id love your advice', 'looking for a method',
  'looking for something that works', 'i want results', 'i want to live off this',
  'i want to do this full time', 'i want to quit my job', 'i want to be free',
  // ----- Enrichissement v2 FR -----
  'jaimerais me lancer dans', 'jveux changer de vie', 'jveux arrondir mes fins de mois',
  'jveux un complement de revenu', 'jveux etre mon propre patron', 'jveux arreter de subir',
  'jai besoin dun plan', 'jveux des bases solides', 'jveux passer pro', 'jveux me former serieusement',
  'comment je men sors', 'aide moi a demarrer', 'jveux un truc concret',
  // ----- EN -----
  'i want to get into', 'i want to change my life', 'i want extra income on the side', 'i want a side income',
  'i want to be my own boss', 'i need a plan', 'i want solid foundations', 'i want to go pro',
  'i want to turn pro', 'help me get started', 'i want something concrete', 'i want to take this seriously',
];

// L'utilisateur décrit sa situation actuelle → fin de Situation.
const SITUATION_KEYWORDS = [
  'je fais', 'je suis', 'je bosse', 'je travaille', 'mon job', 'mon taf', 'mon boulot', 'mon métier', 'mon metier',
  // NB : les noms d'entreprise (« mon business », « ma boîte »…) sont volontairement
  // SORTIS d'ici → ils sont dans BUSINESS_KEYWORDS. Sinon « je veux lancer mon
  // business » (un simple OBJECTIF) flaggait à tort la situation comme décrite.
  'freelance', 'salarié', 'salarie', 'étudiant', 'etudiant', 'au chômage', 'au chomage', 'en poste',
  'depuis', 'ça fait', 'ca fait', 'cela fait', 'mon mrr', 'mon ca', 'chiffre d\'affaire', 'chiffre daffaire',
  'ca mensuel', 'par mois', 'le mois dernier', 'je gagne', 'je génère', 'je genere', 'je fais environ',
  'actuellement', 'en ce moment', 'aujourd\'hui je', 'mes clients', 'mon offre', 'mon produit',
  'i work', 'i\'m a', 'i am a', 'my job', 'my business', 'my company', 'my agency', 'my saas', 'revenue',
  'mrr', 'per month', 'last month', 'currently', 'right now',
  // ----- Argot jeune / contexte -----
  'je taf', 'je taffe', 'mon taf', 'je bosse dans', 'je bosse en', 'là je suis', 'la je suis', 'en vrai je',
  'askip je', 'je gère', 'je gere', 'ça fait un bail', 'ca fait un bail', 'depuis un moment',
  // ----- English (current situation) -----
  'i do', 'i work in', 'i work as', 'i work at', 'im working', 'i run a', 'i started', 'ive been', 'i have been',
  'right now im', 'currently im', 'these days', 'for the past', 'full time', 'part time', 'full-time', 'part-time',
  'im a student', 'im employed', 'im self employed', 'im self-employed', 'my niche', 'my industry', 'my situation',
  'i make around', 'i earn around', 'i generate', 'per month i', 'a month', 'last month i', 'so far ive',
  'my current', 'at the moment', 'i sell', 'i offer', 'my clients are',
  // ----- Enrichissement FR (situation actuelle / contexte) -----
  'jai commence', 'ca fait x mois', 'ca fait x ans', 'jen suis a', 'pour linstant je', 'en gros je fais',
  'je debute', 'je suis debutant', 'jai pas encore', 'jai jamais', 'je gere mon', 'je tiens un',
  'je suis encore au lycee', 'je suis a la fac', 'jsuis etudiant', 'jsuis lyceen', 'jhabite a', 'jai x ans',
  'a cote de mes etudes', 'en parallele de mon taf', 'jai un cdi', 'jsuis en alternance', 'jsuis au rsa',
  // ----- EN -----
  'i just started', 'ive been doing this for', 'so far im at', 'for now i', 'basically i do',
  'im a beginner', 'im just starting', 'i havent yet', 'ive never', 'i manage a', 'i own a small',
  'im still in school', 'im in college', 'im a student', 'i live in', 'im x years old',
  'on the side of my studies', 'alongside my job', 'i have a 9 to 5', 'im an apprentice',
  // ----- Enrichissement v2 FR -----
  'jhabite chez mes parents', 'jsuis au smic', 'jbosse en usine', 'jsuis livreur', 'jsuis serveur',
  'jsuis interimaire', 'jsuis en reconversion', 'jai un side project', 'jfais ca le soir',
  'jai monte ma boite', 'jsuis a mon compte depuis', 'jsuis au chomage', 'jcherche du taf',
  'jsuis freelance depuis', 'jvends deja un peu',
  // ----- EN -----
  'i live with my parents', 'i work minimum wage', 'i work in a warehouse', 'im a delivery driver',
  'im a waiter', 'im a temp', 'im switching careers', 'i have a side project', 'i do this after work',
  'i started my business', 'ive been self employed for', 'im unemployed', 'im job hunting',
  'i already sell a bit',
];

// L'utilisateur a déjà une activité / un business à scaler (toutes niches,
// pas seulement SaaS) → on adapte les questions vers le CA / la croissance.
const BUSINESS_KEYWORDS = [
  // ----- Structures & statuts -----
  'mon business', 'mon entreprise', 'ma boite', 'ma boîte', 'ma société', 'ma societe', 'ma startup',
  'ma start-up', 'mon agence', 'agence', 'smma', 'studio', 'mon studio', 'mon cabinet',
  'freelance', 'auto-entrepreneur', 'autoentrepreneur', 'auto entrepreneur', 'micro-entreprise',
  'entrepreneur', 'entrepreneuse', 'fondateur', 'fondatrice', 'cofondateur', 'ceo', 'gérant', 'gerant',
  'indépendant', 'independant', 'à mon compte', 'a mon compte', 'self-employed', 'founder', 'co-founder',
  // ----- Commerce / vente -----
  'ma boutique', 'mon shop', 'mon ecommerce', 'mon e-commerce', 'e-commerce', 'ecommerce', 'dropshipping',
  'dropship', 'print on demand', 'pod', 'marketplace', 'amazon fba', 'fba', 'shopify', 'mon resto',
  'mon restaurant', 'mon salon', 'mon local', 'commerce', 'retail', 'revendeur', 'grossiste',
  // ----- Services / prestation -----
  'coach', 'coaching', 'mentor', 'mentorat', 'consultant', 'consulting', 'conseil', 'prestataire',
  'prestation', 'freelancing', 'copywriter', 'copywriting', 'closer', 'setter', 'community manager',
  'social media manager', 'monteur', 'graphiste', 'designer', 'développeur', 'developpeur', 'devis',
  'webdesigner', 'ugc', 'créateur de contenu', 'createur de contenu', 'créatrice', 'influenceur', 'influenceuse',
  // ----- Niches courantes -----
  'fitness', 'nutrition', 'coach sportif', 'personal trainer', 'immobilier', 'real estate', 'trading',
  'trader', 'crypto', 'forex', 'investissement', 'finance', 'marketing', 'growth', 'saas', 'logiciel',
  'mon app', 'application', 'plateforme', 'abonnement', 'infoprénariat', 'infopreneur', 'formation en ligne',
  'mlm', 'affiliation', 'affiliate',
  // ----- Vocabulaire business / activité -----
  'mes clients', 'ma clientèle', 'ma clientele', 'mon offre', 'mes offres', 'mon produit', 'mes produits',
  'mon service', 'mes services', 'mes ventes', 'mon ca', 'mon chiffre', 'chiffre d\'affaire', 'chiffre d\'affaires',
  'chiffre daffaire', 'revenus', 'mon revenu', 'marge', 'bénéfice', 'benefice', 'rentabilité', 'rentabilite',
  'mon équipe', 'mon equipe', 'mes salariés', 'mes salaries', 'mes employés', 'mes employes', 'mes prospects',
  'mes leads', 'mon tunnel', 'mon funnel', 'mes campagnes', 'ads', 'publicité', 'publicite', 'acquisition',
  'mon panier moyen', 'taux de conversion', 'je vends', 'je facture', 'je prospecte', 'je signe des clients',
  // ----- Anglais -----
  'my business', 'my company', 'my agency', 'my startup', 'my shop', 'my store', 'my clients', 'my offer',
  'my product', 'my service', 'my revenue', 'my sales', 'my team', 'my leads', 'i sell', 'i run', 'i own',
  // ----- Argot jeune / biz & argent -----
  'mon biz', 'le biz', 'je fais du biz', 'side hustle', 'side business', 'business en ligne', 'je dropship',
  'je fais de la money', 'des lovés', 'thune', 'thunes', 'maille', 'la maille', 'oseille',
  'biff', 'caillasse', 'flouze', 'pésos', 'pesos', 'money', 'cash', 'mes sous', 'des sous',
  'je gratte', 'je fais des ventes', 'business model',
  // ----- English (has an activity / business) -----
  'my brand', 'my ecom', 'my e-com', 'my ecom brand', 'my online store', 'my dropshipping',
  'my coaching', 'my course', 'my newsletter', 'my channel', 'my page', 'my account',
  'content creator', 'creator', 'youtuber', 'tiktoker', 'streamer', 'influencer', 'freelancer',
  'agency owner', 'smma owner', 'ecom store', 'online business', 'my saas', 'my app', 'my startup',
  'i freelance', 'i consult', 'i coach', 'self employed', 'self-employed', 'solopreneur', 'entrepreneur',
  'my mrr', 'my revenue', 'my margins', 'my funnel', 'my offer', 'my clients', 'my customers',
  'i run ads', 'my ad spend', 'my pipeline', 'my leads', 'my conversions',
  // ----- Enrichissement : niches services/locales (alignées sur ACTIVITY_TYPES) -----
  'mon salon', 'mon institut', 'mon onglerie', 'estheticienne', 'prothesiste ongulaire', 'coiffeur',
  'coiffeuse', 'barbier', 'tatoueur', 'maquilleuse', 'mon resto', 'mon restaurant', 'food truck',
  'traiteur', 'patisserie', 'boulangerie', 'therapeute', 'naturopathe', 'osteopathe', 'kine',
  'sophrologue', 'praticien', 'coach sportif', 'prepa physique', 'mon cabinet', 'investissement locatif',
  'marchand de biens', 'airbnb',
  // ----- EN -----
  'my salon', 'my barbershop', 'nail tech', 'lash tech', 'my restaurant', 'food truck', 'my practice',
  'my clinic', 'naturopath', 'therapist', 'real estate investor', 'my rentals', 'my properties',
  // ----- Enrichissement v2 FR (audience / monétisation / rôles) -----
  'mon compte insta', 'ma page insta', 'ma communaute', 'mon audience', 'mes abonnes', 'jmonetise',
  'jvends des prestas', 'jfais du closing', 'jfais du setting', 'jsuis closer', 'jsuis setter',
  'jfais de lugc', 'mon shop etsy', 'ma chaine youtube', 'mon tiktok', 'jfais de laffiliation',
  'jsuis dropshippeur', 'mon compte pro',
  // ----- EN -----
  'my instagram account', 'my following', 'my audience', 'my subscribers', 'i monetize', 'i sell services',
  'i do closing', 'im a closer', 'im a setter', 'i do ugc', 'my etsy shop', 'my youtube channel',
  'my tiktok', 'i do affiliate', 'im a dropshipper', 'my business account',
];

// L'utilisateur exprime une douleur / des conséquences → prêt pour la Transition.
const PAIN_KEYWORDS = [
  'manque', 'il me manque', 'difficile', 'dur', 'c\'est dur', 'galère', 'galere', 'je galère', 'je galere',
  'bloqué', 'bloque', 'je bloque', 'coincé', 'coince', 'problème', 'probleme', 'soucis', 'souci',
  'frustré', 'frustre', 'frustrant', 'marre', 'ras-le-bol', 'stagne', 'je stagne', 'stagnation', 'ça stagne',
  'j\'arrive pas', 'jarrive pas', 'j\'y arrive pas', 'n\'y arrive pas', 'compliqué', 'complique',
  'je perds', 'perte', 'pas assez', 'pas suffisant', 'trop peu', 'épuisé', 'epuise', 'à bout', 'a bout',
  'fatigué', 'fatigue', 'crevé', 'creve', 'burn', 'burnout', 'overwhelm', 'débordé', 'deborde',
  'plafonne', 'je plafonne', 'plafond', 'n\'avance pas', 'navance pas', 'ça avance pas', 'pas de résultat',
  'pas de resultat', 'pas de client', 'peu de client', 'pas de vente', 'peu de vente', 'pas de lead',
  'inconstant', 'irrégulier', 'irregulier', 'instable', 'pas rentable', 'je perds de l\'argent',
  'stuck', 'struggle', 'struggling', 'hard', 'frustrated', 'not enough', 'stagnant', 'overwhelmed',
  'no clients', 'no sales', 'burned out', 'plateau', 'losing money',
  // ----- Argot jeune / galère -----
  'je rame', 'ça rame', 'ca rame', 'je rame grave', 'c\'est mort', 'la hess', 'c\'est la hess', 'la dèche',
  'la deche', 'je suis dead', 'je suis cuit', 'je suis grillé', 'je suis grille', 'je suis ko', 'je suis hs',
  'au fond du trou', 'à la rue', 'a la rue', 'c\'est chaud', 'trop chaud', 'c\'est relou', 'relou',
  'je suis blasé', 'blasé', 'blase', 'ça me soûle', 'ca me soule', 'ça me saoule', 'je sature', 'je suis dégoûté',
  'dégouté', 'degoute', 'je tourne en rond', 'je suis paumé', 'paumé', 'paume', 'je suis largué', 'largué',
  'ça part en cacahuète', 'je suis au taquet', 'j\'en peux plus', 'jen peux plus', 'ça le fait pas', 'wallah je galère',
  // ----- English (pain / consequences) -----
  'i cant', 'i can\'t', 'cant seem to', 'i\'m stuck', 'im stuck', 'stuck at', 'stuck on', 'no progress',
  'not growing', 'not working', 'doesnt work', 'isnt working', 'not getting', 'cant get clients',
  'no clients coming', 'inconsistent', 'unstable income', 'unpredictable', 'feast or famine', 'cant scale',
  'plateaued', 'hit a plateau', 'hit a wall', 'spinning my wheels', 'wasting time', 'wasting money',
  'losing money', 'not profitable', 'barely making', 'struggling to', 'i struggle with', 'its frustrating',
  'so frustrating', 'im exhausted', 'burnt out', 'burned out', 'fed up', 'sick of', 'tired of', 'overwhelmed',
  'falling behind', 'going nowhere', 'demotivated', 'lost motivation', 'i give up',
  // ----- §7.3 additions -----
  'ca fait des mois que', 'ca fait des annees que', 'ca me stresse', 'me stresse', 'stresse', 'stressant',
  'je perds de largent', 'je perds du temps sur', 'losing money on', 'wasting money on',
  'been struggling for months', 'its stressing me out', 'so stressful', 'really stressful',
  // ----- Enrichissement FR (douleur / consequences) -----
  'jen ai marre de', 'jen peux vraiment plus', 'je sais plus quoi faire', 'je suis perdu',
  'je tourne en boucle', 'jai limpression de stagner', 'rien ne bouge', 'ca decolle pas',
  'jarrive pas a vendre', 'jai pas de resultats', 'je procrastine', 'je manque de discipline',
  'je manque de methode', 'je manque de clarte', 'jai trop dinfos', 'je sais pas par ou commencer',
  'jai peur de me planter', 'jai deja perdu de largent', 'je me disperse', 'je suis seul la dessus',
  // ----- EN -----
  'im sick and tired of', 'i dont know what to do', 'im lost', 'going in circles', 'nothing moves',
  'cant get it off the ground', 'i cant sell', 'no results', 'i procrastinate', 'i lack discipline',
  'i lack a method', 'i lack clarity', 'information overload', 'dont know where to start',
  'afraid to fail', 'already lost money', 'im spread too thin', 'doing this alone',
  // ----- Enrichissement v2 (douleur / conséquences) -----
  'ca me prend la tete', 'ca me bouffe', 'jvois pas le bout', 'jai tout essaye', 'rien ne marche',
  'jme decourage', 'jperds confiance', 'jai plus de motivation', 'ca fait trop longtemps', 'jose pas me lancer',
  'syndrome de limposteur', 'jai honte', 'jen ai gros', 'jdors mal a cause de', 'jsuis sous leau',
  'jcravache pour rien', 'jvends pas assez', 'mes posts marchent pas', 'jai aucune visibilite', 'personne mecrit',
  // ----- EN -----
  'it keeps me up at night', 'its eating at me', 'i cant see the end', 'ive tried everything', 'nothing works',
  'im losing confidence', 'i lost my motivation', 'this has gone on too long', 'i dont dare start',
  'imposter syndrome', 'im ashamed', 'im drowning', 'i grind for nothing', 'i dont sell enough',
  'my posts flop', 'i have no visibility', 'nobody messages me', 'no one engages',
];

// §7.1 — Signaux d'ACHAT : le prospect pose des questions qui signalent un intérêt concret.
const BUYING_SIGNAL_KEYWORDS: string[] = [
  // Prix / modalités
  'ca coute combien', 'cest quel budget', 'facilites de paiement', 'par mois ou en une fois',
  'combien ca coute', 'quel est le tarif', 'quel est le prix', 'ca fait combien',
  // EN
  'how much does it cost', 'how much is it', 'whats the price', 'what does it cost',
  'is there a payment plan', 'payment plan', 'monthly or one time', 'can i pay monthly',
  'how much', 'what is the cost', 'whats the investment',
  // Projection / possession
  'quand on pourrait commencer', 'ca prend combien de temps', 'on commencerait par quoi',
  'je ferais quoi en premier', 'du coup je ferais', 'on commencerait comment',
  // EN
  'when can we start', 'when could we start', 'how long does it take', 'what would i do first',
  'where do we start', 'how does it work', 'whats included', 'whats next',
  // Détails d'usage
  'cest inclus', 'ca marche aussi pour', 'et si je veux', 'ca marche pour moi',
  // EN
  'is that included', 'does it include', 'does it work for', 'would it work for my', 'can i also',
  // Garanties
  'si ca marche pas', 'il y a une garantie', 'ya une garantie', 'satisfait ou rembourse',
  // EN
  'what if it doesnt work', 'is there a guarantee', 'money back', 'refund', 'refund policy',
  // ----- Enrichissement : intention d'achat explicite -----
  'je prends', 'je le prends', 'je veux minscrire', 'comment je minscris', 'comment on fait',
  'comment ca se passe', 'je suis chaud pour', 'on signe', 'envoie le lien', 'envoie moi le lien',
  'tu prends les cb', 'paypal', 'virement', 'jai ma carte', 'comment je paye', 'ou je paye',
  'on commence quand', 'je peux commencer quand', 'il reste des places', 'cest quand le prochain',
  // EN
  'i\'ll take it', 'ill take it', 'im in', 'sign me up', 'how do i sign up', 'how do i join',
  'how do i enroll', 'send me the link', 'where do i pay', 'do you take card', 'do you take paypal',
  'can i start today', 'when can i start', 'are there spots left', 'whats the next step',
  // ----- Enrichissement v2 (prix / engagement / logistique) -----
  'cest combien le mois', 'ya des facilites', 'je peux payer en plusieurs fois', 'cest sans engagement',
  'jpeux annuler quand', 'cest accessible debutant', 'il faut quel niveau', 'ca marche depuis le tel',
  'combien de temps par jour', 'jaurai un suivi', 'on se voit en visio', 'cest des lives ou des videos',
  'jai acces a vie', 'cest quoi la prochaine etape', 'tu me files le lien', 'je reserve comment',
  // ----- EN -----
  'how much a month', 'any installments', 'can i pay in installments', 'is it no commitment',
  'can i cancel anytime', 'is it beginner friendly', 'what level do i need', 'does it work from my phone',
  'how much time per day', 'do i get support', 'are there live calls', 'is it lifetime access',
  'how do i book', 'just send me the link', 'i want to reserve', 'put me down',
];

// §7.4 — AUTORITÉ : qui prend la décision ?
const AUTHORITY_POSITIVE_KEYWORDS: string[] = [
  'cest moi qui decide', 'je peux signer', 'je decide seul', 'cest ma decision',
  'je suis le seul a decider', 'je gere ca tout seul', 'jai le feu vert',
  // EN
  'im the decision maker', 'i decide', 'i can sign', 'its my call', 'i can commit',
  'i make the decisions', 'i have the final say', 'i can decide on my own',
  // ----- Enrichissement -----
  'cest moi le patron', 'jai pas a demander', 'je gere mon argent', 'cest mon budget',
  'je fais ce que je veux', 'jai pas de comptes a rendre', 'cest moi qui vois',
  'im my own boss', 'i dont need to ask anyone', 'its my money', 'its all on me', 'i call the shots',
  // ----- Enrichissement v2 -----
  'jai mon propre argent', 'je travaille je peux investir', 'cest mes economies', 'jai un peu de cote',
  'jassume', 'jprends mes decisions seul', 'jai pas a en parler', 'cest moi qui paie',
  // ----- EN -----
  'i have my own income', 'i can invest', 'these are my savings', 'i have some saved up',
  'i own it', 'i make my own choices', 'i pay for it myself', 'no one to answer to',
];

const AUTHORITY_BLOCKED_KEYWORDS: string[] = [
  'il faut que je demande', 'faut que je demande', 'jen parle a', 'jen parle avec',
  'mon associe', 'ma femme', 'mon mari', 'mon boss', 'mon manager', 'mon comptable',
  'cest pas moi qui gere le budget', 'pas moi qui decide', 'je suis pas seul',
  'on decide a deux', 'je dois en parler', 'faut que jen parle',
  // EN
  'i need to ask', 'i have to check with', 'let me check with', 'need to talk to',
  'ill run it by', 'my partner', 'not my decision', 'not up to me',
  'we decide together', 'i dont control the budget', 'i have to talk to',
  // ----- Enrichissement FR -----
  'jen parle a ma copine', 'jen parle a mon copain', 'faut que je vois avec', 'jdois demander a mes parents',
  'mes parents', 'cest mes parents qui', 'faut laccord de', 'je suis mineur', 'jsuis mineur',
  // ----- EN -----
  'i need to ask my parents', 'im a minor', 'check with my wife', 'check with my husband',
  'check with my girlfriend', 'check with my boyfriend', 'ask my parents', 'i need approval from',
  // ----- Enrichissement v2 FR -----
  'jdemande a mon assoc', 'faut que jvoie avec ma meuf', 'faut que jvoie avec mon mec',
  'cest mes parents qui paient', 'jai pas acces au compte', 'cest pas mon argent', 'faut que jen parle a la maison',
  // ----- EN -----
  'i share finances', 'my parents pay', 'i dont have access to the account', 'its not my money',
  'i have to run it by my family', 'need to ask my co-founder', 'i need to talk to my spouse',
];

// §7.5 — ÉTAT ÉMOTIONNEL du prospect.
const EMOTIONAL_HOT_KEYWORDS: string[] = [
  'ca minteresse', 'ca mintéresse', 'ah ouais carrement', 'jaime bien', 'exactement',
  'trop bien', 'cest cool', 'ca a lair bien', 'je suis partant', 'je suis chaud',
  'ca me parle', 'cest exactement ce que', 'je cherchais ca', 'ca correspond',
  // EN
  'im interested', 'that sounds great', 'i love that', 'i like that', 'that resonates',
  'im in', 'lets do it', 'sounds good', 'sounds amazing', 'definitely', 'absolutely',
  'for sure', 'this is what i need', 'where do i sign', 'sign me up', 'yes!', '100%',
  // ----- Enrichissement FR (chaud / motivé / argot jeune) -----
  'jadore', 'grave interesse', 'grave chaud', 'trop chaud', 'chaud bouillant', 'je valide',
  'ca me hype', 'ca me parle grave', 'go', 'go go', 'banger', 'cest exactement ca', 'parfait pour moi',
  'jattendais que ca', 'tu lis dans mes pensees', 'cest fait pour moi', 'je kiffe', 'ca me motive a balle',
  'tu me motives', 'jsuis chaud', 'jsuis trop chaud', 'partant a fond', 'wesh carrement',
  // ----- EN -----
  'lets gooo', 'lets goo', 'im so in', 'count me in', 'this is exactly what i need', 'i love this',
  'youre reading my mind', 'this hypes me up', 'so down', 'im down', 'hell yes', 'heck yes',
  // ----- Enrichissement v2 FR -----
  'ca me donne envie', 'jveux foncer', 'jveux pas rater ca', 'on fait comment du coup', 'jai trop hate',
  'ca tombe bien', 'cest ce quil me faut', 'jsuis motive comme jamais', 'enfin quelquun qui comprend',
  'jsigne ou', 'jattends que ca', 'la oui clairement',
  // ----- EN -----
  'this makes me want to', 'i want to dive in', 'i dont want to miss this', 'so how do we do this',
  'i cant wait', 'perfect timing', 'this is what i needed', 'never been this motivated',
  'finally someone who gets it', 'where do i sign up', 'this is a no brainer', 'yeah for sure lets go',
];

const EMOTIONAL_COLD_KEYWORDS: string[] = [
  'je sais pas trop', 'bof', 'moyen', 'pas sur', 'pas convaincu', 'je vais voir',
  'peut etre', 'cest possible', 'on verra', 'pas trop mon truc',
  // EN
  'i guess', 'maybe', 'not sure', 'i dont know', 'i dunno', 'possibly', 'well see',
  'im not sure', 'sounds okay', 'could be', 'i need to think', 'not convinced',
  // ----- Enrichissement FR -----
  'mouais bof', 'jsais pas si', 'pourquoi pas', 'a voir', 'faut voir', 'ca depend',
  'jhesite', 'jsuis mitige', 'pas fou', 'ca me tente moyen', 'jsuis pas emballe',
  // ----- EN -----
  'meh', 'idk', 'we\'ll see', 'depends', 'on the fence', 'kinda', 'sorta', 'not really feeling it',
  'im torn', 'im hesitant', 'not blown away',
  // ----- Enrichissement v2 FR -----
  'jverrai bien', 'pas trop pour moi', 'jsuis pas sur que ce soit pour moi', 'ca minteresse moyen',
  'jsais pas trop quoi en penser', 'bof bof', 'jaccroche pas trop', 'mouais pourquoi pas',
  // ----- EN -----
  'ill see how it goes', 'not really for me', 'not sure its for me', 'kind of meh',
  'dont know what to think', 'so so', 'im lukewarm', 'eh maybe',
];

const EMOTIONAL_SKEPTICAL_KEYWORDS: string[] = [
  'mouais', 'cest trop beau', 'tout le monde dit ca', 'jai deja vu ca',
  'encore un qui', 'cest quoi larnaque', 'cest du bullshit', 'ca metonnerait',
  'jy crois pas trop', 'cest une arnaque', 'prove it', 'prouve moi',
  // EN
  'sounds too good to be true', 'ive heard that before', 'everyone says that',
  'im skeptical', 'i doubt it', 'i dont believe', 'how do i know', 'ive been burned',
  'is this legit', 'is this a scam', 'red flag', 'too good to be true',
  // ----- Enrichissement FR -----
  'cest des promesses', 'facile a dire', 'tout le monde promet ca', 'jy crois pas',
  'cest commercial', 'tu vends du reve', 'cest du vent', 'pyramide', 'systeme pyramidal',
  'trop beau pour etre vrai', 'cest pas net', 'ya anguille sous roche', 'jai un doute',
  // ----- EN -----
  'just promises', 'easy to say', 'everyone promises that', 'youre selling a dream',
  'all talk', 'sounds like hype', 'pyramid scheme', 'mlm vibes', 'i call bs',
  // ----- Enrichissement v2 FR -----
  'cest trop facile', 'si cetait vrai ca se saurait', 'tout le monde dit pareil', 'jveux des preuves dabord',
  'ya un loup', 'cest louche', 'jme fais pas avoir deux fois', 'ca sent le commercial',
  // ----- EN -----
  'if it were true everyone would', 'this is too easy', 'i want proof first', 'something is off',
  'this is fishy', 'wont get fooled again', 'sounds salesy', 'whats the catch',
];

// §7.6 — REFROIDISSEMENT / DÉCROCHAGE : le prospect se désengage.
const COOLING_KEYWORDS: string[] = [
  'faut que jy aille', 'je dois y aller', 'je dois partir', 'jai pas le temps la',
  'envoie moi un mail', 'envoie un mail', 'tu peux menvoyer un mail',
  'je regarderai ca', 'je verrai ca', 'je te tiens au courant',
  // EN
  'i have to go', 'i gotta go', 'gotta run', 'send me an email', 'shoot me an email',
  'ill look at it', 'ill check it out', 'ill think about it', 'let me think about it',
  'ill get back to you', 'ill let you know', 'talk later', 'maybe another time',
  'not a good time', 'im busy', 'catch you later',
  // ----- Enrichissement FR (décrochage / esquive) -----
  'on en reparle', 'je te recontacte', 'la jai pas le temps', 'jsuis au taf', 'jsuis occupe',
  'plus tard ptet', 'je sais pas encore', 'jhesite encore', 'laisse moi le temps', 'jverrai plus tard',
  'jdois filer', 'jdois y aller la', 'a la base je regardais juste', 'jfaisais que regarder',
  // ----- EN -----
  'ttyl', 'talk soon', 'ill circle back', 'reach out later', 'im at work', 'kinda busy',
  'not sure yet', 'still thinking', 'gimme some time', 'i gotta run', 'just browsing', 'just looking',
  // ----- Enrichissement v2 FR -----
  'jrepasserai', 'jte ping plus tard', 'la jpeux pas trop parler', 'jsuis en deplacement', 'jte redis',
  'pas le bon moment la', 'jai un truc la', 'jsuis pas chez moi', 'jvois ca ce week end', 'jte fais signe',
  // ----- EN -----
  'ill swing by later', 'ill ping you later', 'cant really talk now', 'im traveling', 'ill let you know later',
  'bad timing right now', 'im in the middle of something', 'im not home', 'ill look this weekend', 'ill hit you up',
];

const PHASE_LABELS: Record<Lang, Record<SettingPhase, string>> = {
  en: {
    connexion: 'Connection',
    situation: 'Situation',
    probleme: 'Problem',
    transition: 'Transition to the call',
  },
  fr: {
    connexion: 'Connexion',
    situation: 'Situation',
    probleme: 'Problème',
    transition: 'Transition vers le call',
  },
};

// ===== Détection de langue (FR / EN) =====
// Marqueurs « fonction » très fréquents et discriminants. On compte les tokens
// du prospect qui tombent dans chaque liste ; les accents (présents dans le
// texte brut, retirés par normalize) renforcent fortement le signal FR.
const FR_MARKERS = new Set([
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'le', 'la', 'les', 'un', 'une', 'des', 'du',
  'et', 'est', 'suis', 'pas', 'mais', 'pour', 'avec', 'dans', 'mon', 'ma', 'mes', 'ton', 'ta',
  'ca', 'cest', 'qui', 'que', 'quoi', 'plus', 'fait', 'veux', 'jai', 'tres', 'toi', 'moi',
  'bonjour', 'salut', 'merci', 'vraiment', 'beaucoup', 'aussi', 'parce', 'comme', 'aux',
  'cette', 'sont', 'ete', 'alors', 'donc', 'bien', 'ne', 'ses', 'leur', 'notre', 'votre',
  'ils', 'elles', 'sur', 'au', 'ce',
  // ----- Enrichissement : marqueurs FR discriminants (argot inclus) -----
  'jsuis', 'jveux', 'jvais', 'jfais', 'jpeux', 'jpense', 'jcrois', 'jdois', 'tas', 'ya', 'wesh', 'ouais',
  'genre', 'grave', 'trop', 'vraiment', 'enfin', 'franchement', 'perso', 'quand', 'parce', 'pourquoi',
  'comment', 'combien', 'chez', 'depuis', 'pendant', 'tellement', 'carrement', 'faut', 'ptet', 'jte',
]);
const EN_MARKERS = new Set([
  'the', 'i', 'you', 'to', 'and', 'is', 'are', 'an', 'of', 'for', 'with', 'my', 'your',
  'it', 'that', 'this', 'im', 'dont', 'want', 'need', 'hey', 'thanks', 'really', 'just',
  'do', 'does', 'have', 'has', 'was', 'were', 'what', 'how', 'why', 'when', 'about', 'can',
  'we', 'they', 'he', 'she', 'so', 'but', 'because', 'like', 'yes',
  // ----- Enrichissement : marqueurs EN discriminants (argot inclus) -----
  'gonna', 'wanna', 'gotta', 'aint', 'yeah', 'actually', 'literally', 'honestly', 'kinda', 'sorta',
  'though', 'would', 'could', 'should', 'from', 'into', 'than', 'then', 'also', 'still', 'even',
  'much', 'many', 'where', 'which', 'here', 'there', 'around', 'pretty', 'gonna', 'lemme',
]);
const FR_ACCENTS_RE = /[àâäçéèêëîïôöùûüÿœæ]/i;

// ===== Grammaire : négation + portée de proposition =====
// Négateurs (formes normalisées, sans accent/apostrophe). « plus » est exclu car
// trop ambigu (« plus de clients » = davantage vs « j'en peux plus »).
const NEGATORS = new Set([
  'ne', 'n', 'pas', 'jamais', 'aucun', 'aucune', 'sans', 'rien', 'ni', 'nul', 'nulle', 'point',
  'no', 'not', 'never', 'without', 'dont', 'doesnt', 'don', 'doesn',
]);

// Conjonctions d'opposition / coordination : elles CLÔTURENT la portée d'une
// négation (« je galère pas MAIS je veux scaler » → la négation ne franchit pas
// « mais »). On les utilise pour borner la fenêtre de détection de négation.
const CLAUSE_BREAKERS = new Set([
  'mais', 'pourtant', 'cependant', 'toutefois', 'neanmoins', 'contre', 'sauf', 'malgre',
  'donc', 'car', 'et', 'ou', 'puis', 'alors', 'ensuite', 'or', 'parce',
  'but', 'however', 'though', 'although', 'yet', 'so', 'because',
]);

export class SettingCoach {
  /**
   * Déduit la phase de setting et la prochaine action depuis la conversation.
   * `dyn` (dynamique comportementale) est optionnel : fourni, il rend le coach
   * momentum-aware (prédiction de closing, priorité, urgence calibrée).
   */
  analyze(messages: ExtractedMessage[], dyn?: ConversationDynamics): SettingCoaching {
    // On qualifie surtout sur ce que LE PROSPECT a dit (messages reçus).
    const theirText = messages.filter((m) => !m.isSent).map((m) => m.text || '').join(' \n ');
    // Normalisation (accents, apostrophes, lettres répétées…) + tokenisation,
    // calculées une seule fois et réutilisées pour chaque lexique.
    const normText = this.normalize(theirText);
    const tokens = normText ? normText.split(' ') : [];

    // Langue détectée du prospect → langue des conseils (message à lui envoyer).
    const lang = this.detectLang(tokens, theirText);

    const hasObjective = this.hasAny(tokens, normText, OBJECTIVE_KEYWORDS);
    const hasSituation = this.hasAny(tokens, normText, SITUATION_KEYWORDS);
    const hasPain = this.hasAny(tokens, normText, PAIN_KEYWORDS);
    const hasBusiness = this.hasAny(tokens, normText, BUSINESS_KEYWORDS);

    // §7 signals
    const buyingSignal = this.hasAny(tokens, normText, BUYING_SIGNAL_KEYWORDS);
    const hasEmotionalHot = this.hasAny(tokens, normText, EMOTIONAL_HOT_KEYWORDS);
    const hasEmotionalCold = this.hasAny(tokens, normText, EMOTIONAL_COLD_KEYWORDS);
    const hasEmotionalSkeptical = this.hasAny(tokens, normText, EMOTIONAL_SKEPTICAL_KEYWORDS);
    const authorityConfirmed = this.hasAny(tokens, normText, AUTHORITY_POSITIVE_KEYWORDS);
    const authorityBlocked = this.hasAny(tokens, normText, AUTHORITY_BLOCKED_KEYWORDS);
    const hasCooling = this.hasAny(tokens, normText, COOLING_KEYWORDS);

    // Skeptical beats hot (if they're both present, trust the doubt).
    let emotionalState: EmotionalState = 'neutral';
    if (hasEmotionalSkeptical) emotionalState = 'skeptical';
    else if (hasEmotionalHot) emotionalState = 'hot';
    else if (hasEmotionalCold) emotionalState = 'cold';

    let phase: SettingPhase;
    if (hasPain && hasSituation) phase = 'transition';
    else if (hasSituation) phase = 'probleme';
    else if (hasObjective) phase = 'situation';
    else phase = 'connexion';

    const revealed: SettingRevealed = { objective: hasObjective, situation: hasSituation, pain: hasPain };
    const facts = this.extractFacts(theirText, normText, lang);
    // Improvisation : le message intègre ce que le prospect a révélé (objectif,
    // activité) — « réutilise ses mots » → plus d'impact, plus naturel.
    const nextStep = this.nextStep(phase, hasBusiness, lang, facts);
    const missing = this.computeMissing(revealed, facts, lang);

    // Objections ciblées (détectées sur mots-clés, indépendamment de la langue)
    // utiles aux tactiques de closing.
    const objKws = (label: string) => OBJECTION_GROUPS.find((g) => g.label === label)?.kws ?? [];
    const hasBudgetObjection = this.hasAny(tokens, normText, objKws('Limited budget'));
    const hasStalling = this.hasAny(tokens, normText, [...objKws('Stalling'), ...objKws('Procrastination')]);
    const hasTrustIssue = this.hasAny(tokens, normText, objKws('Trust / proof needed'));

    // Closing : readiness, offre recommandée et tactique prioritaire — tirés du
    // framework de setting (cf. méthodo « situation actuelle / désirée / blocages
    // + budget + urgence »).
    const qualificationScore = this.qualificationScore(revealed, facts, {
      buyingSignal,
      emotionalState,
      authorityConfirmed,
      authorityBlocked,
      hasCooling,
    });
    const recommendedOffer = this.recommendedOffer(phase, revealed, hasBusiness, hasBudgetObjection, lang);

    // Momentum (depuis la dynamique) → prédiction de closing + priorité d'action.
    const momentum = this.momentumOf(dyn);
    const closeProbability = this.closeProbability(qualificationScore, momentum, emotionalState, buyingSignal, dyn);
    const priority = this.priorityOf({
      phase,
      revealed,
      momentum,
      closeProbability,
      buyingSignal,
    });
    // Qualifié = situation ET douleur révélées (ou déjà en transition) — sert de
    // garde-fou pour ne pas céder au prix avant d'avoir vraiment qualifié.
    const qualified = phase === 'transition' || (revealed.situation && revealed.pain);
    const closingTactic = this.closingTactic(
      {
        buyingSignal, emotionalState, hasCooling, hasStalling, hasBudgetObjection, hasTrustIssue,
        authorityBlocked, qualified, momentum, priority,
      },
      lang
    );

    return {
      phase,
      phaseLabel: PHASE_LABELS[lang][phase],
      lang,
      hasBusiness,
      nextStep,
      summary: {
        nextStep, revealed, missing, facts, qualificationScore, recommendedOffer, closingTactic,
        closeProbability, momentum, priority,
      },
      buyingSignal,
      emotionalState,
      authorityConfirmed,
      authorityBlocked,
      hasCooling,
    };
  }

  // ==================== Extraction de faits clés ====================

  /**
   * Extrait des faits exploitables des messages du prospect : budget, horizon,
   * objectif chiffré, type d'activité, objections. Best-effort (heuristique FR).
   * `rawText` garde la casse/les chiffres d'origine ; `normText` est normalisé.
   */
  private extractFacts(rawText: string, normText: string, lang: Lang): ConversationFacts {
    const facts: ConversationFacts = {
      budget: null,
      timeline: null,
      goal: null,
      activity: null,
      objections: [],
    };

    const lower = (rawText || '').toLowerCase();

    // --- Montants : budget (ce qu'il a) vs objectif chiffré (ce qu'il vise). ---
    const moneyRe = /(?:[$€]\s*\d[\d  .,]*(?:\s*k)?|\d[\d  .,]*\s*(?:k€|k\$|k\b|€|\$|euros?|euro|balles?|dollars?|usd|bucks?))(?:\s*\/?\s*(?:mois|an|année|annee|semaine|sem|month|year|week|mo|yr|wk))?/gi;
    let m: RegExpExecArray | null;
    while ((m = moneyRe.exec(lower)) !== null) {
      const amount = m[0].replace(/\s+/g, ' ').trim();
      const ctx = lower.slice(Math.max(0, m.index - 45), m.index);
      const after = lower.slice(m.index + m[0].length, m.index + m[0].length + 25);
      const around = ctx + ' ' + after;
      const isGoal = /mrr|objectif|atteindre|vise|viser|gagner|générer|generer|au minimum|par mois|\/mois|\/an|goal|target|reach|aim|make|generate|per month|\/month|\/mo/.test(around);
      const isBudget = /reste|côté|cote|budget|investir|dispo|j'?ai|compte|économ|econom|mettre|peux|environ|prix|coûte|coute|left|budget|invest|afford|save|spend|price|cost|around|about/.test(ctx);
      if (isGoal && !facts.goal) facts.goal = amount;
      else if (isBudget && !facts.budget) facts.budget = amount;
      // Montant ambigu (ni contexte « objectif » ni contexte « budget ») : on
      // n'INVENTE pas de budget. Mieux vaut un fait manquant qu'un fait erroné.
    }

    // --- Horizon / deadline. ---
    const timeRe = /(?:d'?ici\s+|in\s+|within\s+)?\d+\s*(?:[-àa]\s*\d+)?\s*(?:mois|semaines?|jours?|ans?|années?|annees?|months?|weeks?|days?|years?)/i;
    const tm = lower.match(timeRe);
    if (tm) facts.timeline = tm[0].replace(/\s+/g, ' ').trim();
    else if (/deadline|quelques mois|prochainement|bient[oô]t|cette ann[eé]e|in a few months|soon|this year|asap/.test(lower)) facts.timeline = lang === 'fr' ? 'à confirmer' : 'to be confirmed';

    // --- Type d'activité. ---
    for (const t of ACTIVITY_TYPES) {
      if (t.kws.some((kw) => normText.includes(kw))) {
        facts.activity = lang === 'fr' ? t.labelFr : t.label;
        break;
      }
    }

    // --- Objections / freins. ---
    for (const g of OBJECTION_GROUPS) {
      if (g.kws.some((kw) => normText.includes(this.normalize(kw)))) {
        facts.objections.push(lang === 'fr' ? g.labelFr : g.label);
      }
    }

    return facts;
  }

  /** Axes encore à qualifier (révélés manquants + faits non collectés). */
  private computeMissing(revealed: SettingRevealed, facts: ConversationFacts, lang: Lang): string[] {
    const missing: string[] = [];
    if (lang === 'fr') {
      if (!revealed.objective) missing.push('Son objectif / ce qu\'il cherche');
      if (!revealed.situation) missing.push('Son activité / sa situation actuelle');
      if (!revealed.pain) missing.push('Sa douleur / les conséquences');
      if (!facts.budget) missing.push('Son budget disponible');
      if (!facts.timeline) missing.push('Son timing / sa deadline');
    } else {
      if (!revealed.objective) missing.push('Their goal / what they\'re looking for');
      if (!revealed.situation) missing.push('Their activity / current situation');
      if (!revealed.pain) missing.push('Their pain / the consequences');
      if (!facts.budget) missing.push('Their available budget');
      if (!facts.timeline) missing.push('Their timing / deadline');
    }
    return missing;
  }

  // ==================== Closing (méthodo de setting) ====================

  /**
   * Readiness au closing (0-100). Suit la logique de la formation : on close
   * d'autant plus facilement que le prospect a révélé sa situation actuelle, sa
   * situation désirée (objectif) et ses blocages, qu'on connaît son budget et
   * qu'il envoie des signaux d'achat / un état émotionnel chaud.
   */
  private qualificationScore(
    revealed: SettingRevealed,
    facts: ConversationFacts,
    signals: {
      buyingSignal: boolean;
      emotionalState: EmotionalState;
      authorityConfirmed: boolean;
      authorityBlocked: boolean;
      hasCooling: boolean;
    }
  ): number {
    let score = 0;
    if (revealed.situation) score += 20; // situation actuelle
    if (revealed.objective) score += 20; // situation désirée / objectif
    if (revealed.pain) score += 25;      // blocages
    if (facts.budget) score += 10;       // budget connu
    if (signals.buyingSignal) score += 15;
    if (signals.emotionalState === 'hot') score += 10;
    else if (signals.emotionalState === 'cold') score -= 5;
    else if (signals.emotionalState === 'skeptical') score -= 10;
    if (signals.hasCooling) score -= 10;
    if (signals.authorityConfirmed) score += 5;
    else if (signals.authorityBlocked) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Élan de la conversation, fusionné depuis la dynamique comportementale
   * (cadence, vitesse de réponse, récence, balle dans son camp). Sans dynamique
   * disponible → 'steady' (neutre).
   */
  private momentumOf(dyn?: ConversationDynamics): Momentum {
    if (!dyn) return 'steady';
    // Refroidissement : froid, vu sans réponse, balle chez nous depuis 2j, cadence ↓.
    if (
      dyn.temperature === 'cold' ||
      dyn.seenNotAnswered ||
      (dyn.lastMessageIsSent && (dyn.lastMessageAgeMs ?? 0) > 2 * COACH_DAY) ||
      dyn.cadenceTrend === 'down'
    ) {
      return 'cooling';
    }
    // Accélération : cadence ↑, réponses rapides et régulières, ou relation chaude.
    if (
      dyn.cadenceTrend === 'up' ||
      (dyn.theirAvgResponseMs != null && dyn.theirAvgResponseMs < COACH_HOUR && dyn.theirResponseRate >= 0.7) ||
      dyn.temperature === 'hot'
    ) {
      return 'accelerating';
    }
    return 'steady';
  }

  /**
   * Prédiction : probabilité de closer maintenant (0-100). Part de la readiness
   * de qualification, ajustée par le momentum, l'état émotionnel, les signaux
   * d'achat et la réactivité comportementale. Déterministe, sans IA externe.
   */
  private closeProbability(
    qualificationScore: number,
    momentum: Momentum,
    emotionalState: EmotionalState,
    buyingSignal: boolean,
    dyn?: ConversationDynamics
  ): number {
    let p = qualificationScore * 0.6; // socle : ce qu'on a réellement qualifié
    if (momentum === 'accelerating') p += 15;
    else if (momentum === 'cooling') p -= 20;
    if (emotionalState === 'hot') p += 8;
    else if (emotionalState === 'skeptical') p -= 12;
    else if (emotionalState === 'cold') p -= 6;
    if (buyingSignal) p += 10;
    if (dyn) p += (dyn.theirResponseRate - 0.5) * 12; // réactivité (±6)
    return Math.max(0, Math.min(100, Math.round(p)));
  }

  /**
   * Mode d'action prioritaire (machine à états du setting) :
   *  - reengage : ça refroidit → relancer la dynamique avant tout ;
   *  - close    : qualifié + chaud / forte proba → pousser le call / l'offre ;
   *  - qualify  : il reste situation ou blocages à creuser ;
   *  - nurture  : tôt / signaux faibles → entretenir sans forcer.
   */
  private priorityOf(ctx: {
    phase: SettingPhase;
    revealed: SettingRevealed;
    momentum: Momentum;
    closeProbability: number;
    buyingSignal: boolean;
  }): Priority {
    if (ctx.momentum === 'cooling') return 'reengage';
    const qualified = ctx.phase === 'transition' || (ctx.revealed.situation && ctx.revealed.pain);
    if (qualified && (ctx.closeProbability >= 60 || ctx.buyingSignal)) return 'close';
    if (!ctx.revealed.situation || !ctx.revealed.pain) return 'qualify';
    return 'nurture';
  }

  /**
   * Offre à pousser une fois la qualification suffisante. Reprend l'arbitrage de
   * la formation : petit budget / débutant sans activité → formation low-ticket ;
   * déjà une activité à scaler → call coaching. Null tant qu'on n'a pas creusé
   * situation + blocages (trop tôt pour proposer).
   */
  private recommendedOffer(
    phase: SettingPhase,
    revealed: SettingRevealed,
    hasBusiness: boolean,
    hasBudgetObjection: boolean,
    lang: Lang
  ): string | null {
    const qualified = phase === 'transition' || (revealed.situation && revealed.pain);
    if (!qualified) return null;
    const lowTicket = !hasBusiness || hasBudgetObjection;
    if (lang === 'fr') {
      return lowTicket
        ? 'Oriente vers la formation low-ticket (débutant / budget serré) plutôt que le call.'
        : 'Propose un call pour le coaching (il a déjà une activité à scaler).';
    }
    return lowTicket
      ? 'Point them to the low-ticket course (beginner / tight budget) rather than the call.'
      : 'Offer a call for the coaching (they already have a business to scale).';
  }

  /**
   * Tactique de closing prioritaire. Réflexes clés (issus de la méthodo +
   * analyse de scripts de closing réels, cf. mémoire pro-coach-engine) :
   * (1) sceptique → le faire raconter puis lui demander CE QU'IL a besoin de
   * voir, pas une preuve générique ; (2) prix demandé avant qualification →
   * garder le cadre, ne pas céder le prix tout de suite ; (3) objection budget
   * → recadrer (prix vs coût, « comparé à quoi ? ») avant de pousser l'urgence ;
   * (4) doit en parler à un tiers → l'aider à revenir avec une décision, pas
   * une question ; (5) chaud qui temporise → créer de l'urgence.
   */
  private closingTactic(
    signals: {
      buyingSignal: boolean;
      emotionalState: EmotionalState;
      hasCooling: boolean;
      hasStalling: boolean;
      hasBudgetObjection: boolean;
      hasTrustIssue: boolean;
      authorityBlocked: boolean;
      qualified: boolean;
      momentum: Momentum;
      priority: Priority;
    },
    lang: Lang
  ): string | null {
    const interested = signals.buyingSignal || signals.emotionalState === 'hot';
    // Budget objection sortie du bloc générique : elle a désormais son propre
    // recadrage (ci-dessous) plutôt que de tomber direct sur l'urgence.
    const stalling = signals.hasCooling || signals.hasStalling;

    // Doute / besoin de preuve passe avant tout : pousser un sceptique = le perdre.
    if (signals.emotionalState === 'skeptical' || signals.hasTrustIssue) {
      return lang === 'fr'
        ? 'Il doute : ne te justifie pas en premier. Fais-le raconter (« on dirait que tu t\'es déjà fait avoir, c\'est quoi l\'histoire ? »), puis demande-lui PRÉCISÉMENT ce qu\'il aurait besoin de voir pour être rassuré — et donne exactement ça, pas une preuve générique.'
        : 'He\'s skeptical: don\'t justify yourself first. Get him to tell his story ("sounds like you\'ve been burned before — what happened?"), then ask him EXACTLY what he\'d need to see to feel reassured — and give him precisely that, not generic proof.';
    }
    // Il veut le prix / la suite avant d'avoir été qualifié : ne pas céder le
    // cadre en donnant le prix trop tôt (cf. « cut to the chase »).
    if (signals.buyingSignal && !signals.qualified) {
      return lang === 'fr'
        ? 'Il veut le prix ou la suite tout de suite, mais tu ne le connais pas encore assez : ne donne pas le prix maintenant, garde le cadre — repose une question sur sa situation ou son objectif avant d\'y revenir.'
        : 'He wants the price or next steps right away, but you don\'t know enough about him yet: don\'t give the price now, hold the frame — ask about his situation or goal before coming back to it.';
    }
    if (signals.hasBudgetObjection) {
      return lang === 'fr'
        ? 'Objection budget : recadre avant de baisser le prix ou de pousser l\'urgence. « Le prix c\'est ce que tu payes aujourd\'hui, le coût c\'est ce que tu perds si ça reste comme ça dans 6 mois » — et demande « comparé à quoi ? » pour ancrer le prix à la valeur du résultat, pas dans l\'absolu.'
        : 'Budget objection: reframe before discounting or pushing urgency. "The price is what you pay today, the cost is what you keep losing if this stays the same in 6 months" — and ask "compared to what?" to anchor the price to the outcome\'s value, not in the abstract.';
    }
    if (signals.authorityBlocked) {
      return lang === 'fr'
        ? 'Il doit en parler à quelqu\'un (conjoint, parents...) : ne le pousse pas à demander la permission. Aide-le à revenir vers cette personne avec une DÉCISION déjà prise plutôt qu\'une question — « tu comptes lui présenter ça comme un problème ou comme une solution ? »'
        : 'He needs to check with someone (partner, parents...): don\'t push him to ask permission. Help him go back to them with a DECISION already made, not a question — "are you going to bring this to them as a problem or as a solution?"';
    }
    if (interested && stalling) {
      return lang === 'fr'
        ? 'Il est intéressé mais temporise (« plus tard », « pas le budget » = souvent des excuses, ne les prends pas au pied de la lettre). Crée de l\'urgence : place / tarif limité dans le temps, et propose de verrouiller maintenant.'
        : 'He\'s interested but stalling ("later", "no budget" are usually excuses — don\'t take them at face value). Create urgency: limited spots / price going up soon, and offer to lock it in now.';
    }
    // Momentum chaud + prêt à closer → frapper maintenant.
    if (signals.priority === 'close' && signals.momentum === 'accelerating') {
      return lang === 'fr'
        ? 'Momentum au max : c\'est LE moment. Propose le call / l\'offre tout de suite, pendant qu\'il est chaud — n\'attends pas demain.'
        : 'Momentum is peaking: this is THE moment. Pitch the call / offer right now while he\'s hot — don\'t wait until tomorrow.';
    }
    // Refroidissement → réengager avant de vendre quoi que ce soit.
    if (signals.priority === 'reengage' || signals.momentum === 'cooling') {
      return lang === 'fr'
        ? 'Ça refroidit : réengage AVANT de vendre — un message court et personnel (réagis à une story, pose une question ouverte sur son objectif) pour relancer la dynamique.'
        : 'It\'s cooling: re-engage BEFORE selling — a short, personal message (react to a story, ask an open question about their goal) to revive the momentum.';
    }
    return null;
  }

  /**
   * Prochaine question/action conseillée, tirée du framework de setting. Le
   * message entre guillemets est destiné à être envoyé au prospect : on le rend
   * donc dans SA langue (`lang`).
   */
  private nextStep(phase: SettingPhase, hasBusiness: boolean, lang: Lang, facts?: ConversationFacts): string {
    const goal = facts?.goal || null;
    if (lang === 'fr') {
      switch (phase) {
        case 'connexion':
          return 'Connexion — cerne son objectif : « Qu\'est-ce qui t\'amène à chercher ce genre d\'aide ? Tu sais déjà quel type d\'accompagnement tu cherches ? »';
        case 'situation':
          return hasBusiness
            ? 'Situation — comprends son activité : « Tu fais quoi exactement ? Depuis combien de temps ? Et t\'as fait combien le mois dernier ? »'
            : 'Situation — comprends son contexte : « Tu fais quoi en ce moment ? Depuis combien de temps ? Qu\'est-ce qui t\'a poussé à choisir ça au départ ? »';
        case 'probleme':
          return hasBusiness
            ? 'Problème — creuse la douleur : « Qu\'est-ce qui te manque pour avoir fait plus que ça le mois dernier ? Ça impacte quoi sur ton business / ton quotidien ? »'
            : 'Problème — creuse la douleur : « Qu\'est-ce qui fait que ta situation actuelle ne te suffit pas ? Ça dure depuis combien de temps, et ça a quel impact sur toi ? »';
        case 'transition': {
          // Improvisation : on rappelle SON objectif chiffré quand on le connaît.
          const intro = goal
            ? `Avec ton objectif (${goal}) et tout ce que tu m'as dit`
            : `Avec tout ce que tu m'as dit`;
          return `Transition — propose le call : « ${intro}, ça ressemble à quelque chose sur lequel je peux t'aider. La prochaine étape serait de planifier un call pour confirmer comment. Ça t'aiderait ? »`;
        }
      }
    }
    switch (phase) {
      case 'connexion':
        return 'Connection — pin down their goal: "What brought you to look for this kind of help? Do you already know what type of help you\'re after?"';
      case 'situation':
        return hasBusiness
          ? 'Situation — understand their business: "What exactly do you do? How long have you been at it? And how much did you make last month?"'
          : 'Situation — understand their context: "What are you up to right now? For how long? What made you choose that in the first place?"';
      case 'probleme':
        return hasBusiness
          ? 'Problem — dig into the pain: "What\'s missing for you to have made only that last month? How does it affect your business / your day-to-day revenue?"'
          : 'Problem — dig into the pain: "What makes you feel your current situation isn\'t enough? How long has it been going on, and what impact does it have on you?"';
      case 'transition': {
        const intro = goal
          ? `With your goal (${goal}) and everything you've told me`
          : `From everything you've told me`;
        return `Transition — offer the call: "${intro}, this sounds like something I can help you with. The next step would be to schedule a call to confirm how. Would that help?"`;
      }
    }
  }

  // ==================== Détection de langue ====================

  /**
   * Détermine si le prospect écrit en français ou en anglais à partir de ses
   * messages. On compte les marqueurs « fonction » de chaque langue (+ bonus
   * accents pour le FR). Égalité ou texte vide → FR (audience francophone).
   */
  private detectLang(tokens: string[], rawText: string): Lang {
    let fr = 0;
    let en = 0;
    for (const t of tokens) {
      if (FR_MARKERS.has(t)) fr++;
      if (EN_MARKERS.has(t)) en++;
    }
    if (FR_ACCENTS_RE.test(rawText)) fr += 2;
    if (fr === 0 && en === 0) return 'fr';
    return en > fr ? 'en' : 'fr';
  }

  // ==================== Matching à proximité (tolérant aux fautes) ====================

  /**
   * Vrai si un des mots-clés est présent dans le texte, avec tolérance aux
   * fautes : on tente d'abord une sous-chaîne exacte (rapide), puis un matching
   * mot à mot par distance d'édition (Levenshtein) sur des fenêtres de tokens.
   */
  private hasAny(tokens: string[], _normalizedText: string, keywords: string[]): boolean {
    if (tokens.length === 0) return false;
    for (const kw of keywords) {
      const nkw = this.normalize(kw);
      if (!nkw) continue;
      const kwWords = nkw.split(' ');
      // On cherche TOUTES les occurrences : une occurrence niée n'invalide pas
      // une autre occurrence affirmative ailleurs dans la conversation.
      let from = 0;
      let idx: number;
      while ((idx = this.findMatchIndex(tokens, kwWords, from)) !== -1) {
        if (!this.isNegated(tokens, idx, idx + kwWords.length)) return true;
        from = idx + 1;
      }
    }
    return false;
  }

  /**
   * Index de la 1ʳᵉ occurrence (≥ `from`) de la séquence de mots-clés dans les
   * tokens (chaque mot toléré flou), ou -1.
   */
  private findMatchIndex(tokens: string[], kwWords: string[], from: number): number {
    const w = kwWords.length;
    for (let i = Math.max(0, from); i + w <= tokens.length; i++) {
      let ok = true;
      for (let k = 0; k < w; k++) {
        if (!this.wordMatches(tokens[i + k], kwWords[k])) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  /**
   * Vrai si la séquence [start, end) est sous l'effet d'une négation, en restant
   * dans la même proposition (la portée s'arrête à une conjonction d'opposition).
   * On regarde en amont (négateurs « ne/aucun/sans… ») et en aval (le « pas »
   * post-verbal du français : « je galère PAS »), sans compter les négateurs déjà
   * inclus dans le mot-clé lui-même.
   */
  private isNegated(tokens: string[], start: number, end: number): boolean {
    // Amont (jusqu'à 3 tokens, borné par une rupture de proposition).
    for (let k = start - 1; k >= 0 && k >= start - 3; k--) {
      if (CLAUSE_BREAKERS.has(tokens[k])) break;
      if (NEGATORS.has(tokens[k])) return true;
    }
    // Aval (jusqu'à 2 tokens : « pas/jamais/rien » après le verbe).
    for (let k = end; k < tokens.length && k <= end + 1; k++) {
      if (CLAUSE_BREAKERS.has(tokens[k])) break;
      if (NEGATORS.has(tokens[k])) return true;
    }
    return false;
  }

  /** Deux mots correspondent si identiques ou à ≤ seuil(longueur) éditions près. */
  private wordMatches(token: string, kw: string): boolean {
    if (token === kw) return true;
    const t = this.editThreshold(kw.length);
    if (t === 0) return false; // mots courts → exact uniquement (évite les faux positifs)
    if (Math.abs(token.length - kw.length) > t) return false;
    return this.levenshtein(token, kw) <= t;
  }

  /**
   * Nombre d'éditions tolérées selon la longueur du mot-clé. Plafonné à 1 :
   * tolérer 2 éditions sur les mots longs créait des FAUX POSITIFS coûteux
   * (« commencer » matchait « commerce » → activité détectée à tort). On préfère
   * la PRÉCISION (rater une double-faute, rare) à un mauvais conseil.
   */
  private editThreshold(len: number): number {
    if (len <= 4) return 0;
    return 1;
  }

  /**
   * Normalise une chaîne : minuscules, suppression des accents, COLLAGE des
   * apostrophes (« c'est » → « cest », pour matcher aussi les formes jeunes sans
   * apostrophe « cest », « jai »…), réduction des lettres triplées (« galèèère »
   * → « galere »), ponctuation → espaces, espaces compactés.
   */
  private normalize(s: string): string {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents (diacritiques combinants)
      .replace(/['’`]/g, '') // apostrophes collées : c'est → cest, j'ai → jai
      .replace(/(.)\1{2,}/g, '$1') // lettres répétées 3+ fois
      .replace(/[^a-z0-9 ]+/g, ' ') // ponctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Distance d'édition de Levenshtein (court-circuit si écart de taille > 2). */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(
          dp[j] + 1, // suppression
          dp[j - 1] + 1, // insertion
          prev + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
        );
        prev = tmp;
      }
    }
    return dp[n];
  }
}
