export type UsageMode = 'personal' | 'professional';

export type QuestionType = 'options' | 'scale' | 'textarea' | 'usage' | 'consent' | 'continent' | 'country';

export interface Continent {
  id: string;
  name: string;
  countries: string[];
}

export const CONTINENTS: Continent[] = [
  {
    id: 'europe',
    name: 'Europe',
    countries: ['United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Portugal', 'Austria', 'Greece', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Ukraine', 'Ireland', 'Russia']
  },
  {
    id: 'north-america',
    name: 'North America',
    countries: ['United States', 'Canada', 'Mexico', 'Cuba', 'Puerto Rico', 'Dominican Republic', 'Jamaica', 'Trinidad and Tobago']
  },
  {
    id: 'south-america',
    name: 'South America',
    countries: ['Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela', 'Ecuador', 'Bolivia', 'Uruguay', 'Paraguay', 'Guyana', 'Suriname']
  },
  {
    id: 'asia',
    name: 'Asia',
    countries: ['Japan', 'South Korea', 'China', 'India', 'Indonesia', 'Malaysia', 'Singapore', 'Philippines', 'Thailand', 'Vietnam', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Turkey', 'Israel', 'United Arab Emirates', 'Saudi Arabia', 'Iran', 'Iraq', 'Afghanistan', 'Nepal', 'Myanmar', 'Cambodia', 'Laos', 'Taiwan', 'Hong Kong', 'Kazakhstan', 'Uzbekistan']
  },
  {
    id: 'africa',
    name: 'Africa',
    countries: ['South Africa', 'Egypt', 'Nigeria', 'Kenya', 'Morocco', 'Ghana', 'Tanzania', 'Ethiopia', 'Uganda', 'Rwanda', 'Algeria', 'Tunisia', 'Libya', 'Senegal', 'Ivory Coast', 'Cameroon', 'Democratic Republic of Congo', 'Angola', 'Mozambique', 'Zimbabwe', 'Botswana', 'Namibia', 'Zambia', 'Malawi']
  },
  {
    id: 'oceania',
    name: 'Oceania',
    countries: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Solomon Islands', 'Vanuatu', 'Samoa', 'Tonga', 'Micronesia']
  }
];

export interface QuestionOption {
  main: string;
  sub?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  hint?: string;
  options?: QuestionOption[] | string[];
  scaleMin?: string;
  scaleMax?: string;
  scaleSteps?: number;
  placeholder?: string;
  required?: boolean;
}

export interface QuestionnaireStep {
  id: string;
  phase: string;
  title: string;
  subtitle: string;
  questions: Question[];
  warningBoxes?: WarningBox[];
  showConsent?: boolean;
}

export interface WarningBox {
  type: 'warning' | 'success' | 'info';
  title: string;
  content: string;
}

export interface QuestionnaireAnswers {
  usageMode?: UsageMode;
  consent?: boolean;
  [key: string]: string | boolean | number | UsageMode | undefined;
}

export const QUESTIONNAIRE_STEPS_EN: QuestionnaireStep[] = [
  // Step 0: Warning + consent
  {
    id: 'warning',
    phase: 'Before we begin',
    title: "This questionnaire is not a surveillance tool",
    subtitle: "It's a space to step back and understand a relationship — including your own part in it.",
    questions: [],
    showConsent: true,
    warningBoxes: [
      {
        type: 'warning',
        title: 'Our approach',
        content: "What this tool does: it guides you through self-reflection, using a social media signal as a simple starting point.\n\nWhat it doesn't do: it won't tell you \"who blocked you\" for the purpose of confrontation or control.\n\nIf you're going through intense distress right now, please reach out to someone you trust, or a professional, first."
      },
      {
        type: 'success',
        title: 'Our philosophy',
        content: "When a connection breaks, it's natural to ask \"why them?\". Here, we also gently look at your own side — not to assign blame, but because understanding yourself is the part you can actually act on."
      }
    ]
  },
  // Step 1: Usage
  {
    id: 'usage',
    phase: 'Step 1 — Usage',
    title: 'How will you use this tool?',
    subtitle: 'This answer adapts the experience and features offered at the end.',
    questions: [
      {
        id: 'usageMode',
        type: 'usage',
        label: 'Select your usage type',
        required: true
      }
    ]
  },
  // Step 2: Relationship profile
  {
    id: 'profile',
    phase: 'Phase 1 — You',
    title: 'How do you experience your close relationships?',
    subtitle: 'Before talking about the other person, let\'s take a moment for you.',
    questions: [
      {
        id: 'q1',
        type: 'options',
        label: 'In general, how do you experience your close relationships?',
        required: true,
        options: [
          { main: 'With a lot of investment', sub: 'I give a lot, sometimes more than I receive' },
          { main: 'With some distance', sub: 'I find it hard to open up easily' },
          { main: 'In a balanced way', sub: 'I adapt depending on the person' },
          { main: 'With a lot of anxiety', sub: 'The fear of losing people is often present' }
        ]
      },
      {
        id: 'q2',
        type: 'options',
        label: 'When a conflict comes up in a relationship, you tend to...',
        required: true,
        options: [
          'Approach the other person to talk about it directly',
          'Take a step back and wait',
          'Turn it over in your mind without bringing it up',
          'Avoid the subject to keep the peace'
        ]
      },
      {
        id: 'q2_pattern',
        type: 'options',
        label: 'Is this the first time you\'ve experienced this kind of disconnection?',
        required: true,
        options: [
          { main: 'Yes, this feels completely new to me', sub: 'It\'s the first time I experience something like this' },
          { main: 'No — I\'ve been through something similar before', sub: 'I recognize this feeling' },
          { main: 'It happens to me more often than I\'d like', sub: 'It may be a recurring pattern for me' },
          { main: 'I\'m not sure', sub: 'I haven\'t thought about it this way' }
        ]
      }
    ]
  },
  // Step 3: The relationship
  {
    id: 'relation',
    phase: 'Phase 2 — The relationship',
    title: 'Let\'s talk about this particular relationship',
    subtitle: 'No names. Only what you observed and felt.',
    questions: [
      {
        id: 'q3',
        type: 'options',
        label: 'What was the nature of this connection?',
        required: true,
        options: [
          { main: 'Family', sub: 'Parent, sibling, blood relative' },
          { main: 'Deep friendship', sub: 'Someone you trusted' },
          { main: 'Romantic relationship', sub: 'Partner, ex, or someone emotionally significant' },
          { main: 'Acquaintance or colleague', sub: 'Someone present in your daily life' }
        ]
      },
      {
        id: 'q4',
        type: 'options',
        label: 'How present was this relationship in your real life, beyond social media?',
        required: true,
        options: [
          { main: 'Almost entirely online', sub: 'We rarely or never connected offline' },
          { main: 'A mix of both', sub: 'Online and offline interactions both mattered' },
          { main: 'Mostly real-life', sub: 'Social media was just a way to stay in touch' },
          { main: 'Very central to my daily life', sub: 'This person was deeply present in my reality' }
        ]
      },
      {
        id: 'q5',
        type: 'options',
        label: 'Before this signal, had you felt something change?',
        required: true,
        options: [
          'Yes, I had sensed things cooling off',
          'A little, but I didn\'t want to believe it',
          'No, it came as a complete surprise',
          'I\'m not sure'
        ]
      },
      {
        id: 'q5_last_interaction',
        type: 'options',
        label: 'What was your last real interaction with this person like?',
        required: true,
        options: [
          { main: 'A genuine exchange — things seemed fine', sub: 'Nothing pointed to a problem' },
          { main: 'A tense or unresolved moment', sub: 'There was friction neither of us addressed' },
          { main: 'I honestly can\'t remember', sub: 'We had already drifted apart' },
          { main: 'A silence neither of us broke', sub: 'We both let it fade' }
        ]
      }
    ]
  },
  // Step 4: Introspection
  {
    id: 'introspection',
    phase: 'Phase 3 — Your honest perspective',
    title: 'Looking at your side of the story',
    subtitle: 'The most courageous part. There are no right or wrong answers here.',
    questions: [
      {
        id: 'q6_text',
        type: 'textarea',
        label: 'Looking back, is there anything you might have done differently?',
        hint: 'A word said too quickly, a moment missed, being less available than you wanted to be — or maybe nothing comes to mind, and that\'s okay too.',
        placeholder: 'Think out loud here, without judging yourself...',
        required: false
      },
      {
        id: 'q6',
        type: 'options',
        label: 'In this relationship, how did you balance your needs and theirs?',
        required: true,
        options: [
          { main: 'I tried to keep a balance', sub: 'Giving and receiving felt fairly even' },
          { main: 'I often put their needs first', sub: 'Sometimes I forgot my own' },
          { main: 'I often put my own needs first', sub: 'It was my usual way of functioning' },
          { main: 'It varied a lot', sub: 'It depended on the moment' },
          { main: 'I\'m not sure' }
        ]
      },
      {
        id: 'q7_text',
        type: 'textarea',
        label: 'If this person could speak to you freely, what might they say?',
        hint: 'Try to step into their shoes, with honesty.',
        placeholder: 'It\'s not easy. But this is where understanding begins...',
        required: false
      },
      {
        id: 'q6_emotional_debt',
        type: 'textarea',
        label: 'Is there something you never said that you wish you had?',
        hint: 'This stays between you and Waler.',
        placeholder: 'Take your time. This is a safe space...',
        required: false
      },
      {
        id: 'q6_responsibility',
        type: 'options',
        label: 'How do you see the responsibility for what happened?',
        required: true,
        options: [
          { main: '1 — Mostly outside my control', sub: 'Circumstances or their choices drove it' },
          { main: '2 — A little on me', sub: 'But mostly other factors were at play' },
          { main: '3 — Shared between us', sub: 'It takes two in a relationship' },
          { main: '4 — Largely my part', sub: 'Looking back, I see things I\'d change' },
          { main: '5 — Mostly my responsibility', sub: 'I\'m clear about my role in it' }
        ]
      }
    ]
  },
  // Step 5: The signal
  {
    id: 'signal',
    phase: 'Phase 4 — The received signal',
    title: 'The unfollow as a message',
    subtitle: 'A small online gesture that can say something real. Let\'s read it without dramatizing.',
    questions: [
      {
        id: 'q7',
        type: 'options',
        label: 'What does this gesture represent to you?',
        required: true,
        options: [
          { main: 'A definitive rejection', sub: 'I experience it as a total, irreversible break' },
          { main: 'A need for temporary distance', sub: 'This person may just need space' },
          { main: 'A message I didn\'t know how to read before', sub: 'The sign of a tension that already existed' },
          { main: 'I don\'t know yet', sub: 'That\'s why I\'m doing this questionnaire' }
        ]
      },
      {
        id: 'q8',
        type: 'options',
        label: 'How did you react internally when you discovered it?',
        required: true,
        options: [
          { main: 'Anger or a sense of injustice', sub: 'This feels unfair to me' },
          { main: 'Sadness and pain', sub: 'It hurts deeply' },
          { main: 'Confusion', sub: 'I don\'t understand why' },
          { main: 'Relief mixed with pain', sub: 'Part of me saw it coming' },
          { main: 'Several of these at once', sub: 'It\'s complicated and layered' }
        ]
      }
    ]
  },
  // Step 6: The future
  {
    id: 'future',
    phase: 'Phase 5 — The future',
    title: 'What do you hope happens next?',
    subtitle: 'This is about orienting yourself toward what you want to build.',
    questions: [
      {
        id: 'q9_hope',
        type: 'options',
        label: 'What do you hope for?',
        required: true,
        options: [
          { main: 'I hope we reconnect one day', sub: 'The door isn\'t closed for me' },
          { main: 'I think it\'s better for both of us to move on', sub: 'This chapter needs to end' },
          { main: 'I\'m not ready to think about that yet', sub: 'I need more time to process' },
          { main: 'I want to reach out but don\'t know how', sub: 'I\'m caught between wanting and fearing' },
          { main: 'I want to understand before deciding anything', sub: 'Clarity first, action later' }
        ]
      },
      {
        id: 'q9_future_self',
        type: 'textarea',
        label: 'What kind of person do you want to be in your next close relationship?',
        hint: 'Take your time. This answer is for you, not for them.',
        placeholder: 'Think about the version of yourself you want to become...',
        required: false
      }
    ]
  },
  // Step 7: Summary
  {
    id: 'summary',
    phase: 'Complete reflection',
    title: 'Thank you for this honesty.',
    subtitle: 'Asking yourself these questions openly is one of the most mature things a person can do.',
    questions: []
  }
];

// Questionnaire « professionnel » : même structure (8 étapes, mêmes types) que
// la version personnelle pour réutiliser le renderer générique d'Onboard, mais
// orienté prospection / CRM Instagram (leads, setting en DM, conversion).
// Les étapes 0 (warning + consent) et 1 (usage) sont partagées ; seules les
// phases 2→6 changent. Les ids de questions sont préfixés `p` pour distinguer
// les réponses pro des réponses perso lors de la génération d'insights.
export const PRO_QUESTIONNAIRE_STEPS_EN: QuestionnaireStep[] = [
  // Step 0: Warning + consent (pro-toned)
  {
    id: 'warning',
    phase: 'Before we begin',
    title: "This is not a tool to spy on prospects",
    subtitle: "It's a way to manage your relationships and your pipeline — ethically and without losing track of anyone.",
    questions: [],
    showConsent: true,
    warningBoxes: [
      {
        type: 'warning',
        title: 'Our approach',
        content: "What this tool does: it helps you read social signals (follows, replies, engagement) to nurture real business relationships and never let a warm lead go cold.\n\nWhat it doesn't do: it won't help you pressure, manipulate, or harass anyone. Relationships you can't keep honestly aren't worth keeping.",
      },
      {
        type: 'success',
        title: 'Our philosophy',
        content: "The best sellers don't chase — they pay attention. Here we help you stay organized and human at scale, so the right follow-up reaches the right person at the right time.",
      },
    ],
  },
  // Step 1: Usage (shared)
  {
    id: 'usage',
    phase: 'Step 1 — Usage',
    title: 'How will you use this tool?',
    subtitle: 'This answer adapts the experience and features offered at the end.',
    questions: [
      {
        id: 'usageMode',
        type: 'usage',
        label: 'Select your usage type',
        required: true,
      },
    ],
  },
  // Step 2: Your activity
  {
    id: 'activity',
    phase: 'Phase 1 — Your activity',
    title: 'Tell us about your activity',
    subtitle: 'So we can tailor your pipeline and the signals that matter to you.',
    questions: [
      {
        id: 'p_activity',
        type: 'options',
        label: 'What best describes what you do?',
        required: true,
        options: [
          { main: 'Coach or consultant', sub: 'I sell my expertise or services' },
          { main: 'Creator or influencer', sub: 'I monetize an audience' },
          { main: 'Freelance or service provider', sub: 'I work with clients one-on-one' },
          { main: 'E-commerce or product', sub: 'I sell a product or a brand' },
          { main: 'Agency or small business', sub: 'I manage a team or several clients' },
        ],
      },
      {
        id: 'p_volume',
        type: 'options',
        label: 'How many prospects or clients are you in touch with at once?',
        required: true,
        options: [
          { main: 'Fewer than 10', sub: 'I keep it small and personal' },
          { main: '10 to 50', sub: 'Starting to be hard to track' },
          { main: '50 to 200', sub: 'I definitely lose some along the way' },
          { main: 'More than 200', sub: 'I need real organization' },
        ],
      },
      {
        id: 'p_channel',
        type: 'options',
        label: 'Where do most of your client relationships happen?',
        required: true,
        options: [
          { main: 'Mostly in DMs', sub: 'Instagram conversations are my main channel' },
          { main: 'A mix of DMs and calls', sub: 'I qualify in DM, then close on a call' },
          { main: 'Mostly calls or offline', sub: 'Social media just opens the door' },
          { main: 'Through comments and content', sub: 'Engagement drives my relationships' },
        ],
      },
    ],
  },
  // Step 3: Your prospects
  {
    id: 'prospects',
    phase: 'Phase 2 — Your prospects',
    title: 'How do you handle your prospects today?',
    subtitle: 'No judgment — just a snapshot of how you work right now.',
    questions: [
      {
        id: 'p_source',
        type: 'options',
        label: 'How do prospects usually come to you?',
        required: true,
        options: [
          { main: 'They DM me first', sub: 'Inbound — they reach out' },
          { main: 'I reach out to them', sub: 'Outbound — I start the conversation' },
          { main: 'Through my content', sub: 'They warm up before contacting me' },
          { main: 'Referrals and word of mouth', sub: 'Existing clients send me people' },
        ],
      },
      {
        id: 'p_tracking',
        type: 'options',
        label: 'How do you keep track of your conversations?',
        required: true,
        options: [
          { main: 'In my head', sub: 'I rely on memory' },
          { main: 'Notes or a spreadsheet', sub: 'Manual, and easy to forget' },
          { main: 'A dedicated CRM', sub: 'I already have a system' },
          { main: "I don't really track", sub: 'And I know I lose leads because of it' },
        ],
      },
      {
        id: 'p_qualify',
        type: 'options',
        label: 'When a prospect shows interest, you tend to...',
        required: true,
        options: [
          'Qualify their needs before presenting anything',
          'Present my offer quickly to gauge interest',
          'Wait for them to ask about price or details',
          'It depends on the person and the moment',
        ],
      },
    ],
  },
  // Step 4: Your honest approach
  {
    id: 'approach',
    phase: 'Phase 3 — Your honest approach',
    title: 'Looking at your own side of the sale',
    subtitle: 'The most useful part. There are no right or wrong answers here.',
    questions: [
      {
        id: 'p_lostlead_text',
        type: 'textarea',
        label: 'Think of a prospect who went cold. What do you think really happened?',
        hint: 'A slow reply, a pitch too soon, a follow-up you never sent — or maybe it just wasn\'t the right fit.',
        placeholder: 'Think out loud here, without blaming yourself or them...',
        required: false,
      },
      {
        id: 'p_strength',
        type: 'options',
        label: 'What is your biggest strength in building client relationships?',
        required: true,
        options: [
          { main: 'Building trust', sub: 'People feel comfortable with me' },
          { main: 'Closing', sub: 'I\'m good at the final step' },
          { main: 'Consistency and follow-up', sub: 'I stay present over time' },
          { main: 'Attraction and content', sub: 'I draw the right people in' },
        ],
      },
      {
        id: 'p_gap',
        type: 'options',
        label: 'Where do you lose the most prospects?',
        required: true,
        options: [
          { main: 'At the first message', sub: 'Conversations don\'t even start' },
          { main: 'Mid-conversation', sub: 'Interest fades before the offer' },
          { main: 'At the offer or the price', sub: 'They hesitate and disappear' },
          { main: 'After the call — no follow-up', sub: 'I drop the ball afterwards' },
        ],
      },
      {
        id: 'p_followup_text',
        type: 'textarea',
        label: 'What\'s one thing you keep meaning to improve in your follow-up?',
        hint: 'Be honest — this is the thing a good system could fix for you.',
        placeholder: 'Take your time...',
        required: false,
      },
    ],
  },
  // Step 5: Reading the signals
  {
    id: 'signal',
    phase: 'Phase 4 — Reading the signals',
    title: 'When a prospect goes quiet or unfollows',
    subtitle: 'A small online gesture often carries a real business signal. Let\'s read it without overreacting.',
    questions: [
      {
        id: 'p_unfollow_meaning',
        type: 'options',
        label: 'When a prospect unfollows or goes silent, you read it as...',
        required: true,
        options: [
          { main: 'A lost lead', sub: 'It\'s over, I move on' },
          { main: 'A "not right now"', sub: 'The timing is off, not the fit' },
          { main: 'A sign I moved too fast', sub: 'I may have pushed the offer too early' },
          { main: 'I honestly don\'t track it', sub: 'And I probably should' },
        ],
      },
      {
        id: 'p_reaction',
        type: 'options',
        label: 'How do you usually react?',
        required: true,
        options: [
          { main: 'I follow up with value', sub: 'I re-open the conversation thoughtfully' },
          { main: 'I let it go', sub: 'I focus my energy elsewhere' },
          { main: 'I take it personally', sub: 'It affects my motivation' },
          { main: 'I analyze what went wrong', sub: 'I look for the lesson' },
        ],
      },
    ],
  },
  // Step 6: Your goals
  {
    id: 'goals',
    phase: 'Phase 5 — Your goals',
    title: 'What do you want this tool to do for you?',
    subtitle: 'This helps us put the right features in front of you.',
    questions: [
      {
        id: 'p_goal',
        type: 'options',
        label: 'What matters most to you right now?',
        required: true,
        options: [
          { main: 'Never let a warm lead go cold', sub: 'Catch the signals in time' },
          { main: 'Organize my pipeline', sub: 'See every prospect at a glance' },
          { main: 'Convert more of my conversations', sub: 'Turn interest into clients' },
          { main: 'Save time on follow-up', sub: 'Know who to message and when' },
        ],
      },
      {
        id: 'p_goal_text',
        type: 'textarea',
        label: 'In 3 months, what would make this tool a no-brainer for you?',
        hint: 'Describe the outcome that would make you say "I can\'t work without this".',
        placeholder: 'Think about the result, not the feature...',
        required: false,
      },
    ],
  },
  // Step 7: Summary
  {
    id: 'summary',
    phase: 'Setup complete',
    title: 'You\'re ready to build a real pipeline.',
    subtitle: 'Knowing how you work is the first step to never losing a lead again.',
    questions: [],
  },
];

// Alias conservé pour compatibilité (calcul de longueur, structure identique
// quelle que soit la langue).
export const QUESTIONNAIRE_STEPS = QUESTIONNAIRE_STEPS_EN;

export const QUESTIONNAIRE_STEPS_FR: QuestionnaireStep[] = [
  {
    id: 'warning',
    phase: 'Avant de commencer',
    title: "Ce questionnaire n'est pas un outil de surveillance",
    subtitle: "C'est un espace pour prendre du recul et comprendre une relation — y compris votre propre rôle dedans.",
    questions: [],
    showConsent: true,
    warningBoxes: [
      {
        type: 'warning',
        title: 'Notre approche',
        content: "Ce que fait cet outil : il vous guide dans une réflexion personnelle, en prenant un signal des réseaux sociaux comme simple point de départ.\n\nCe qu'il ne fait pas : il ne vous dira pas « qui vous a bloqué » dans le but de confronter ou de contrôler quelqu'un.\n\nSi vous traversez une détresse intense en ce moment, parlez-en d'abord à une personne de confiance ou à un professionnel."
      },
      {
        type: 'success',
        title: 'Notre philosophie',
        content: "Quand un lien se rompt, il est naturel de se demander « pourquoi eux ? ». Ici, nous regardons aussi, avec douceur, votre propre part — non pas pour vous blâmer, mais parce que se comprendre soi-même est la seule chose sur laquelle on peut vraiment agir."
      }
    ]
  },
  {
    id: 'usage',
    phase: 'Étape 1 — Usage',
    title: 'Comment allez-vous utiliser cet outil ?',
    subtitle: "Cette réponse adapte l'expérience et les fonctionnalités proposées à la fin.",
    questions: [
      {
        id: 'usageMode',
        type: 'usage',
        label: "Sélectionnez votre type d'usage",
        required: true
      }
    ]
  },
  {
    id: 'profile',
    phase: 'Phase 1 — Vous',
    title: 'Comment vivez-vous vos relations proches ?',
    subtitle: "Avant de parler de l'autre personne, prenons un moment pour vous.",
    questions: [
      {
        id: 'q1',
        type: 'options',
        label: 'En général, comment vivez-vous vos relations proches ?',
        required: true,
        options: [
          { main: "Avec beaucoup d'investissement", sub: 'Je donne beaucoup, parfois plus que ce que je reçois' },
          { main: 'Avec une certaine distance', sub: "J'ai du mal à m'ouvrir facilement" },
          { main: 'De façon équilibrée', sub: "Je m'adapte selon la personne" },
          { main: "Avec beaucoup d'anxiété", sub: 'La peur de perdre les gens est souvent présente' }
        ]
      },
      {
        id: 'q2',
        type: 'options',
        label: 'Quand un conflit survient dans une relation, vous avez tendance à…',
        required: true,
        options: [
          "Aller voir l'autre personne pour en parler directement",
          'Prendre du recul et attendre',
          'Y penser en boucle sans en parler',
          'Éviter le sujet pour préserver la paix'
        ]
      },
      {
        id: 'q2_pattern',
        type: 'options',
        label: 'Est-ce la première fois que vous vivez ce genre de rupture ?',
        required: true,
        options: [
          { main: 'Oui, c\'est totalement nouveau pour moi', sub: "C'est la première fois que je vis quelque chose comme ça" },
          { main: "Non — j'ai déjà vécu quelque chose de similaire", sub: 'Je reconnais cette sensation' },
          { main: "Ça m'arrive plus souvent que je ne le voudrais", sub: 'C\'est peut-être un schéma récurrent chez moi' },
          { main: "Je ne suis pas sûr(e)", sub: "Je n'y avais pas pensé sous cet angle" }
        ]
      }
    ]
  },
  {
    id: 'relation',
    phase: 'Phase 2 — La relation',
    title: 'Parlons de cette relation en particulier',
    subtitle: 'Pas de noms. Seulement ce que vous avez observé et ressenti.',
    questions: [
      {
        id: 'q3',
        type: 'options',
        label: 'Quelle était la nature de ce lien ?',
        required: true,
        options: [
          { main: 'Famille', sub: 'Parent, frère/sœur, lien du sang' },
          { main: 'Amitié profonde', sub: 'Une personne en qui vous aviez confiance' },
          { main: 'Relation amoureuse', sub: 'Partenaire, ex, ou une personne importante émotionnellement' },
          { main: 'Connaissance ou collègue', sub: 'Une personne présente dans votre quotidien' }
        ]
      },
      {
        id: 'q4',
        type: 'options',
        label: 'Quelle place cette relation avait-elle dans votre vie réelle, au-delà des réseaux sociaux ?',
        required: true,
        options: [
          { main: 'Presque uniquement en ligne', sub: 'On se voyait rarement, voire jamais, en dehors' },
          { main: 'Un mélange des deux', sub: "Les échanges en ligne et en vrai comptaient autant l'un que l'autre" },
          { main: 'Surtout dans la vraie vie', sub: "Les réseaux sociaux n'étaient qu'un moyen de garder le contact" },
          { main: 'Très centrale dans mon quotidien', sub: 'Cette personne était profondément présente dans ma réalité' }
        ]
      },
      {
        id: 'q5',
        type: 'options',
        label: 'Avant ce signal, aviez-vous senti que quelque chose changeait ?',
        required: true,
        options: [
          'Oui, je sentais que ça se refroidissait',
          "Un peu, mais je ne voulais pas y croire",
          'Non, ça a été une totale surprise',
          "Je ne suis pas sûr(e)"
        ]
      },
      {
        id: 'q5_last_interaction',
        type: 'options',
        label: "Comment s'est passé votre dernier échange réel avec cette personne ?",
        required: true,
        options: [
          { main: 'Un échange sincère — tout semblait bien aller', sub: 'Rien ne laissait présager un problème' },
          { main: 'Un moment tendu ou non résolu', sub: "Il y avait une friction dont on n'a jamais parlé" },
          { main: "Honnêtement, je ne m'en souviens plus", sub: 'On s\'était déjà éloignés' },
          { main: "Un silence qu'aucun de nous deux n'a rompu", sub: 'On a tous les deux laissé la relation s\'éteindre' }
        ]
      }
    ]
  },
  {
    id: 'introspection',
    phase: 'Phase 3 — Votre regard sincère',
    title: "Regarder votre part de l'histoire",
    subtitle: "La partie la plus courageuse. Il n'y a pas de bonne ou de mauvaise réponse ici.",
    questions: [
      {
        id: 'q6_text',
        type: 'textarea',
        label: 'Avec le recul, y a-t-il quelque chose que vous auriez pu faire différemment ?',
        hint: "Un mot dit trop vite, un moment manqué, une disponibilité en dessous de ce que vous vouliez — ou peut-être que rien ne vous vient, et c'est très bien aussi.",
        placeholder: 'Pensez à voix haute ici, sans vous juger…',
        required: false
      },
      {
        id: 'q6',
        type: 'options',
        label: 'Dans cette relation, comment équilibriez-vous vos besoins et les siens ?',
        required: true,
        options: [
          { main: 'J\'essayais de garder un équilibre', sub: 'Donner et recevoir semblait plutôt équitable' },
          { main: 'Je faisais souvent passer ses besoins en premier', sub: "J'en oubliais parfois les miens" },
          { main: 'Je faisais souvent passer mes besoins en premier', sub: 'C\'était ma façon habituelle de fonctionner' },
          { main: 'Ça variait beaucoup', sub: 'Ça dépendait des moments' },
          { main: "Je ne suis pas sûr(e)" }
        ]
      },
      {
        id: 'q7_text',
        type: 'textarea',
        label: 'Si cette personne pouvait vous parler librement, que dirait-elle probablement ?',
        hint: 'Essayez de vous mettre à sa place, avec honnêteté.',
        placeholder: "Ce n'est pas facile. Mais c'est là que la compréhension commence…",
        required: false
      },
      {
        id: 'q6_emotional_debt',
        type: 'textarea',
        label: "Y a-t-il quelque chose que vous n'avez jamais dit et que vous auriez aimé dire ?",
        hint: 'Cela reste entre vous et Waler.',
        placeholder: 'Prenez votre temps. C\'est un espace sûr…',
        required: false
      },
      {
        id: 'q6_responsibility',
        type: 'options',
        label: "Comment percevez-vous la responsabilité de ce qui s'est passé ?",
        required: true,
        options: [
          { main: '1 — Surtout hors de mon contrôle', sub: 'Les circonstances ou ses choix en sont la cause' },
          { main: '2 — Un peu de ma faute', sub: "Mais surtout d'autres facteurs sont entrés en jeu" },
          { main: '3 — Partagée entre nous', sub: 'Une relation se construit à deux' },
          { main: '4 — En grande partie ma part', sub: 'Avec le recul, je vois des choses que je changerais' },
          { main: '5 — Principalement ma responsabilité', sub: "J'ai bien conscience de mon rôle dans tout ça" }
        ]
      }
    ]
  },
  {
    id: 'signal',
    phase: 'Phase 4 — Le signal reçu',
    title: 'Le désabonnement comme message',
    subtitle: "Un petit geste en ligne qui peut en dire long. Essayons de le lire sans dramatiser.",
    questions: [
      {
        id: 'q7',
        type: 'options',
        label: 'Que représente ce geste pour vous ?',
        required: true,
        options: [
          { main: 'Un rejet définitif', sub: 'Je le vis comme une rupture totale et irréversible' },
          { main: 'Un besoin de distance temporaire', sub: 'Cette personne a peut-être juste besoin d\'espace' },
          { main: "Un message que je n'avais pas su lire avant", sub: 'Le signe d\'une tension qui existait déjà' },
          { main: 'Je ne sais pas encore', sub: 'C\'est pour ça que je fais ce questionnaire' }
        ]
      },
      {
        id: 'q8',
        type: 'options',
        label: 'Comment avez-vous réagi intérieurement en le découvrant ?',
        required: true,
        options: [
          { main: "De la colère ou un sentiment d'injustice", sub: 'Je trouve ça injuste' },
          { main: 'De la tristesse et de la peine', sub: 'Ça fait vraiment mal' },
          { main: 'De la confusion', sub: 'Je ne comprends pas pourquoi' },
          { main: 'Un soulagement mêlé de peine', sub: 'Une partie de moi le sentait venir' },
          { main: 'Plusieurs de ces émotions à la fois', sub: "C'est complexe et nuancé" }
        ]
      }
    ]
  },
  {
    id: 'future',
    phase: "Phase 5 — L'avenir",
    title: 'Qu\'espérez-vous pour la suite ?',
    subtitle: 'Il s\'agit de vous orienter vers ce que vous voulez construire.',
    questions: [
      {
        id: 'q9_hope',
        type: 'options',
        label: "Qu'espérez-vous ?",
        required: true,
        options: [
          { main: "J'espère qu'on se retrouvera un jour", sub: "La porte n'est pas fermée pour moi" },
          { main: 'Je pense qu\'il vaut mieux tourner la page, pour nous deux', sub: 'Ce chapitre doit se terminer' },
          { main: "Je ne suis pas encore prêt(e) à y penser", sub: "J'ai besoin de plus de temps pour digérer tout ça" },
          { main: 'Je veux la recontacter mais je ne sais pas comment', sub: "Je suis tiraillé(e) entre l'envie et la peur" },
          { main: 'Je veux comprendre avant de décider quoi que ce soit', sub: "D'abord la clarté, ensuite l'action" }
        ]
      },
      {
        id: 'q9_future_self',
        type: 'textarea',
        label: 'Quel genre de personne voulez-vous être dans votre prochaine relation proche ?',
        hint: 'Prenez votre temps. Cette réponse est pour vous, pas pour elle/lui.',
        placeholder: 'Pensez à la version de vous-même que vous voulez devenir…',
        required: false
      }
    ]
  },
  {
    id: 'summary',
    phase: 'Réflexion terminée',
    title: 'Merci pour cette sincérité.',
    subtitle: "Se poser ces questions aussi ouvertement est l'une des démarches les plus matures qui soient.",
    questions: []
  }
];

export const PRO_QUESTIONNAIRE_STEPS_FR: QuestionnaireStep[] = [
  {
    id: 'warning',
    phase: 'Avant de commencer',
    title: "Ceci n'est pas un outil pour espionner vos prospects",
    subtitle: "C'est une façon de gérer vos relations et votre pipeline — de manière éthique, sans jamais perdre personne de vue.",
    questions: [],
    showConsent: true,
    warningBoxes: [
      {
        type: 'warning',
        title: 'Notre approche',
        content: "Ce que fait cet outil : il vous aide à lire les signaux sociaux (abonnements, réponses, engagement) pour entretenir de vraies relations commerciales et ne jamais laisser un lead prometteur se refroidir.\n\nCe qu'il ne fait pas : il ne vous aidera pas à mettre la pression, manipuler ou harceler qui que ce soit. Une relation qu'on ne peut entretenir honnêtement ne mérite pas d'être entretenue.",
      },
      {
        type: 'success',
        title: 'Notre philosophie',
        content: "Les meilleurs vendeurs ne courent pas après leurs prospects — ils sont attentifs. Ici, nous vous aidons à rester organisé et humain à grande échelle, pour que la bonne relance arrive à la bonne personne, au bon moment.",
      },
    ],
  },
  {
    id: 'usage',
    phase: 'Étape 1 — Usage',
    title: 'Comment allez-vous utiliser cet outil ?',
    subtitle: "Cette réponse adapte l'expérience et les fonctionnalités proposées à la fin.",
    questions: [
      {
        id: 'usageMode',
        type: 'usage',
        label: "Sélectionnez votre type d'usage",
        required: true,
      },
    ],
  },
  {
    id: 'activity',
    phase: 'Phase 1 — Votre activité',
    title: 'Parlez-nous de votre activité',
    subtitle: 'Pour adapter votre pipeline et les signaux qui comptent vraiment pour vous.',
    questions: [
      {
        id: 'p_activity',
        type: 'options',
        label: 'Qu\'est-ce qui décrit le mieux votre activité ?',
        required: true,
        options: [
          { main: 'Coach ou consultant', sub: 'Je vends mon expertise ou mes services' },
          { main: 'Créateur ou influenceur', sub: 'Je monétise une audience' },
          { main: 'Freelance ou prestataire', sub: 'Je travaille avec mes clients en direct' },
          { main: 'E-commerce ou produit', sub: 'Je vends un produit ou une marque' },
          { main: 'Agence ou petite entreprise', sub: 'Je gère une équipe ou plusieurs clients' },
        ],
      },
      {
        id: 'p_volume',
        type: 'options',
        label: 'Avec combien de prospects ou clients êtes-vous en contact en même temps ?',
        required: true,
        options: [
          { main: 'Moins de 10', sub: 'Je garde ça restreint et personnel' },
          { main: '10 à 50', sub: 'Ça commence à devenir difficile à suivre' },
          { main: '50 à 200', sub: "J'en perds sûrement en cours de route" },
          { main: 'Plus de 200', sub: "J'ai besoin d'une vraie organisation" },
        ],
      },
      {
        id: 'p_channel',
        type: 'options',
        label: 'Où se déroulent la plupart de vos relations clients ?',
        required: true,
        options: [
          { main: 'Surtout en DM', sub: 'Les conversations Instagram sont mon canal principal' },
          { main: "Un mélange de DM et d'appels", sub: 'Je qualifie en DM, puis je conclus par appel' },
          { main: 'Surtout par appel ou en présentiel', sub: "Les réseaux sociaux ne font qu'ouvrir la porte" },
          { main: 'Via les commentaires et le contenu', sub: "L'engagement est le moteur de mes relations" },
        ],
      },
    ],
  },
  {
    id: 'prospects',
    phase: 'Phase 2 — Vos prospects',
    title: 'Comment gérez-vous vos prospects aujourd\'hui ?',
    subtitle: 'Aucun jugement — juste un état des lieux de votre façon de travailler actuelle.',
    questions: [
      {
        id: 'p_source',
        type: 'options',
        label: 'Comment vos prospects arrivent-ils généralement à vous ?',
        required: true,
        options: [
          { main: "Ils m'envoient un DM en premier", sub: "Inbound — c'est eux qui viennent vers moi" },
          { main: 'Je vais vers eux', sub: "Outbound — c'est moi qui lance la conversation" },
          { main: 'Via mon contenu', sub: 'Ils se familiarisent avant de me contacter' },
          { main: 'Par recommandation ou bouche-à-oreille', sub: "Mes clients actuels m'envoient des gens" },
        ],
      },
      {
        id: 'p_tracking',
        type: 'options',
        label: 'Comment suivez-vous vos conversations ?',
        required: true,
        options: [
          { main: 'Dans ma tête', sub: 'Je me fie à ma mémoire' },
          { main: 'Des notes ou un tableur', sub: 'Manuel, et facile à oublier' },
          { main: 'Un CRM dédié', sub: "J'ai déjà un système en place" },
          { main: 'Je ne fais pas vraiment de suivi', sub: "Et je sais que je perds des leads à cause de ça" },
        ],
      },
      {
        id: 'p_qualify',
        type: 'options',
        label: "Quand un prospect montre de l'intérêt, vous avez tendance à…",
        required: true,
        options: [
          "Qualifier ses besoins avant de présenter quoi que ce soit",
          "Présenter mon offre rapidement pour jauger l'intérêt",
          "Attendre qu'il/elle demande le prix ou les détails",
          "Ça dépend de la personne et du moment",
        ],
      },
    ],
  },
  {
    id: 'approach',
    phase: 'Phase 3 — Votre approche sincère',
    title: 'Regarder votre propre part dans la vente',
    subtitle: "La partie la plus utile. Il n'y a pas de bonne ou de mauvaise réponse ici.",
    questions: [
      {
        id: 'p_lostlead_text',
        type: 'textarea',
        label: "Pensez à un prospect qui s'est refroidi. Que pensez-vous qu'il se soit vraiment passé ?",
        hint: "Une réponse trop lente, une offre présentée trop tôt, une relance jamais envoyée — ou peut-être que ce n'était simplement pas le bon fit.",
        placeholder: 'Pensez à voix haute ici, sans vous blâmer ni le/la blâmer…',
        required: false,
      },
      {
        id: 'p_strength',
        type: 'options',
        label: 'Quelle est votre plus grande force dans la construction de relations clients ?',
        required: true,
        options: [
          { main: 'Créer de la confiance', sub: "Les gens se sentent à l'aise avec moi" },
          { main: 'Conclure la vente', sub: "Je suis doué(e) pour l'étape finale" },
          { main: 'La régularité et le suivi', sub: 'Je reste présent(e) dans la durée' },
          { main: "L'attraction et le contenu", sub: 'J\'attire les bonnes personnes' },
        ],
      },
      {
        id: 'p_gap',
        type: 'options',
        label: 'À quelle étape perdez-vous le plus de prospects ?',
        required: true,
        options: [
          { main: 'Dès le premier message', sub: 'Les conversations ne démarrent même pas' },
          { main: 'En plein milieu de la conversation', sub: "L'intérêt retombe avant l'offre" },
          { main: "Au moment de l'offre ou du prix", sub: 'Ils hésitent et disparaissent' },
          { main: 'Après l\'appel — pas de relance', sub: 'Je laisse tomber après coup' },
        ],
      },
      {
        id: 'p_followup_text',
        type: 'textarea',
        label: 'Quelle est une chose que vous voulez toujours améliorer dans vos relances ?',
        hint: "Soyez honnête — c'est exactement ce qu'un bon système pourrait résoudre pour vous.",
        placeholder: 'Prenez votre temps…',
        required: false,
      },
    ],
  },
  {
    id: 'signal',
    phase: 'Phase 4 — Lire les signaux',
    title: 'Quand un prospect se tait ou se désabonne',
    subtitle: "Un petit geste en ligne porte souvent un vrai signal business. Apprenons à le lire sans surréagir.",
    questions: [
      {
        id: 'p_unfollow_meaning',
        type: 'options',
        label: 'Quand un prospect se désabonne ou disparaît, vous l\'interprétez comme…',
        required: true,
        options: [
          { main: 'Un lead perdu', sub: "C'est fini, je passe à autre chose" },
          { main: 'Un « pas maintenant »', sub: "Le timing n'était pas bon, pas le fit" },
          { main: "Un signe que j'ai été trop vite", sub: "J'ai peut-être présenté l'offre trop tôt" },
          { main: 'Honnêtement, je ne le suis pas', sub: 'Et je devrais probablement le faire' },
        ],
      },
      {
        id: 'p_reaction',
        type: 'options',
        label: 'Comment réagissez-vous habituellement ?',
        required: true,
        options: [
          { main: 'Je relance avec de la valeur', sub: 'Je rouvre la conversation avec réflexion' },
          { main: 'Je laisse tomber', sub: 'Je concentre mon énergie ailleurs' },
          { main: 'Je le prends personnellement', sub: 'Ça affecte ma motivation' },
          { main: "J'analyse ce qui n'a pas fonctionné", sub: 'Je cherche la leçon à en tirer' },
        ],
      },
    ],
  },
  {
    id: 'goals',
    phase: 'Phase 5 — Vos objectifs',
    title: 'Que voulez-vous que cet outil fasse pour vous ?',
    subtitle: 'Cela nous aide à vous présenter les bonnes fonctionnalités.',
    questions: [
      {
        id: 'p_goal',
        type: 'options',
        label: 'Qu\'est-ce qui compte le plus pour vous en ce moment ?',
        required: true,
        options: [
          { main: 'Ne jamais laisser un lead prometteur se refroidir', sub: 'Capter les signaux à temps' },
          { main: 'Organiser mon pipeline', sub: 'Voir chaque prospect en un coup d\'œil' },
          { main: 'Convertir plus de conversations', sub: "Transformer l'intérêt en clients" },
          { main: 'Gagner du temps sur les relances', sub: 'Savoir qui contacter, et quand' },
        ],
      },
      {
        id: 'p_goal_text',
        type: 'textarea',
        label: 'Dans 3 mois, qu\'est-ce qui ferait de cet outil une évidence pour vous ?',
        hint: 'Décrivez le résultat qui vous ferait dire « je ne peux plus travailler sans ça ».',
        placeholder: 'Pensez au résultat, pas à la fonctionnalité…',
        required: false,
      },
    ],
  },
  {
    id: 'summary',
    phase: 'Configuration terminée',
    title: "Vous êtes prêt(e) à construire un vrai pipeline.",
    subtitle: 'Comprendre votre façon de travailler est la première étape pour ne plus jamais perdre un lead.',
    questions: [],
  },
];

// Renvoie le bon jeu d'étapes selon le mode d'usage et la langue active. Par
// défaut (mode non encore choisi, étapes 0→1) on retombe sur la version
// personnelle, dont les étapes partagées sont identiques en structure.
export function getQuestionnaireSteps(
  mode: UsageMode | null | undefined,
  language: 'en' | 'fr' = 'en'
): QuestionnaireStep[] {
  const isPro = mode === 'professional';
  if (language === 'fr') {
    return isPro ? PRO_QUESTIONNAIRE_STEPS_FR : QUESTIONNAIRE_STEPS_FR;
  }
  return isPro ? PRO_QUESTIONNAIRE_STEPS_EN : QUESTIONNAIRE_STEPS_EN;
}
