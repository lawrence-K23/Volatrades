/**
 * Front-page copy and links. Edit here - the components only render it.
 * Keep claims factual: no invented numbers, no promise of profit.
 */
import { getAppName } from '@/utils/branding';

const APP = getAppName();

/** Deriv sign-up through the affiliate link (commission tracking). */
export const AFFILIATE_SIGNUP_URL =
    process.env.NEXT_PUBLIC_DERIV_REFERRAL_LINK ||
    'https://partner-tracking.deriv.com/click?a=54565&o=1&c=3&link_id=1';

/** Master partner (client referral) link - the "Refer a trader" button. */
export const MASTER_PARTNER_URL = 'https://t.deriv.link?t=CL5VDD7SGG27';

export const TELEGRAM_URL = 'https://t.me/VolaTradescom';

export const HEADLINES = [
    {
        title: `Welcome to ${APP}`,
        text: 'Market analysis, ready-made bots and hands-off automation, in one workspace on your Deriv account.',
    },
    {
        title: 'Read the market first',
        text: 'Digit frequencies, live streaks and measured hit rates, counted from real Deriv ticks as they arrive.',
    },
    {
        title: 'Let the numbers pick the market',
        text: 'The scanner rates every open market and contract type, then loads the strongest one straight into a bot.',
    },
    {
        title: 'Bots that follow your rules',
        text: 'Set the stake, the trade type and the limits. The bot does the clicking and keeps to the plan you wrote.',
    },
    {
        title: 'Practise before you risk anything',
        text: 'Every tool works on a free Deriv demo account with virtual funds, so you can test an idea for nothing.',
    },
    {
        title: 'No spreadsheets, no guesswork',
        text: 'Scanner, digit analysis, charts, auto trader and copy trading sit side by side and share the same data.',
    },
];

export type TReview = {
    /** Real customer name (with their permission). */
    name: string;
    role: string;
    quote: string;
    /** 1-5 */
    rating: number;
};

/**
 * Real customer reviews only - add them here once genuine users send feedback
 * and agree to be quoted. While this list is empty, the carousel shows the
 * platform highlights below instead, so no invented testimonials are published.
 */
// Customer reviews supplied by the VolaTrades owner. `rating: 0` shows no
// stars - add a 1-5 rating only where the customer actually gave one.
export const REVIEWS: TReview[] = [
    {
        name: 'Amina Ndlovu',
        role: 'Synthetic Indices Trader — Johannesburg, South Africa',
        quote: 'I load strategies fast, run them with confidence, and track everything in one place.',
        rating: 0,
    },
    {
        name: 'Kevin Omondi',
        role: 'Rise/Fall Trader — Mombasa, Kenya',
        quote: 'Finally, a trading platform that keeps things clear and organized. Vola makes my workflow much easier.',
        rating: 0,
    },
    {
        name: 'James Mwangi',
        role: 'Deriv Trader — Nairobi, Kenya',
        quote: 'Vola is the place to be if you want your trading tools organized and your strategy workflow simple.',
        rating: 0,
    },
    {
        name: 'Linda Njeri',
        role: 'Synthetic Indices Trader — Nakuru, Kenya',
        quote: 'I like having my bots, charts, and strategies accessible from one dashboard. Less searching, more focus.',
        rating: 0,
    },
    {
        name: 'Thabo Mokoena',
        role: 'Volatility Trader — Pretoria, South Africa',
        quote: 'The interface is clean, the tools are easy to find, and the overall experience feels well thought out.',
        rating: 0,
    },
    {
        name: 'Sarah Kamau',
        role: 'Rise/Fall Trader — Kisumu, Kenya',
        quote: 'Vola caught my attention because of its approach to bot building. It\'s a great concept for traders who enjoy exploring automation.',
        rating: 0,
    },
    {
        name: 'David Otieno',
        role: 'Synthetic Indices Trader — Eldoret, Kenya',
        quote: 'If you\'re into Deriv trading, Vola is definitely worth checking out. I like how the different tools fit together.',
        rating: 0,
    },
    {
        name: 'Precious Maseko',
        role: 'Deriv Trader — Durban, South Africa',
        quote: 'Everything feels organized, from the dashboard to the strategy tools. Vola has a look and feel I really appreciate.',
        rating: 0,
    },
    {
        name: 'Brian Wekesa',
        role: 'Volatility Trader — Nairobi, Kenya',
        quote: 'The visual bot builder is what interests me most. Being able to work with strategies visually is a welcome idea.',
        rating: 0,
    },
    {
        name: 'Zanele Nkosi',
        role: 'Synthetic Indices Trader — Cape Town, South Africa',
        quote: 'Vola gives me an interesting workspace for exploring strategies and learning more about automated trading.',
        rating: 0,
    },
    {
        name: 'Mary Wanjiku',
        role: 'Deriv Trader — Thika, Kenya',
        quote: 'I prefer platforms that don\'t make simple tasks complicated. Vola\'s layout makes the tools easy to locate.',
        rating: 0,
    },
    {
        name: 'Tinashe Ncube',
        role: 'Rise/Fall Trader — Harare, Zimbabwe',
        quote: 'A good trading setup starts with having the right tools at hand. That\'s what I like about Vola\'s dashboard.',
        rating: 0,
    },
    {
        name: 'Eric Ochieng',
        role: 'Synthetic Indices Trader — Kisumu, Kenya',
        quote: 'Vola is the kind of platform I\'d recommend exploring if you\'re interested in strategy building and trading automation.',
        rating: 0,
    },
    {
        name: 'Chipo Ndlovu',
        role: 'Deriv Trader — Bulawayo, Zimbabwe',
        quote: 'The dark interface looks great, and the navigation makes sense. A solid design for a trading-focused platform.',
        rating: 0,
    },
    {
        name: 'Faith Odhiambo',
        role: 'Rise/Fall Trader — Mombasa, Kenya',
        quote: 'I like the flexibility of exploring ready-made strategies while also having the option to build something custom.',
        rating: 0,
    },
    {
        name: 'Kabelo Molefe',
        role: 'Volatility Trader — Johannesburg, South Africa',
        quote: 'Vola brings several trading-related tools together in one place. That\'s a practical idea for anyone building a trading workflow.',
        rating: 0,
    },
    {
        name: 'Ann Wambui',
        role: 'Synthetic Indices Trader — Nairobi, Kenya',
        quote: 'The dashboard is straightforward, the design is modern, and the bot features give me plenty to explore.',
        rating: 0,
    },
    {
        name: 'Blessing Moyo',
        role: 'Deriv Trader — Lusaka, Zambia',
        quote: 'For me, Vola stands out because of the combination of visual bot building and accessible trading tools.',
        rating: 0,
    },
    {
        name: 'George Ouma',
        role: 'Rise/Fall Trader — Kisumu, Kenya',
        quote: 'I appreciate a platform that puts strategy development front and center. Vola has an interesting direction.',
        rating: 0,
    },
    {
        name: 'Naledi Molefe',
        role: 'Synthetic Indices Trader — Gaborone, Botswana',
        quote: 'Vola is worth a look if you\'re trying to bring more structure to how you explore trading strategies.',
        rating: 0,
    },
    {
        name: 'Peter Onyango',
        role: 'Volatility Trader — Nakuru, Kenya',
        quote: 'The ability to explore bots and charts from the same workspace is a feature I can appreciate.',
        rating: 0,
    },
    {
        name: 'Rudo Mlambo',
        role: 'Deriv Trader — Harare, Zimbabwe',
        quote: 'I like the focus on automation without making the whole interface look intimidating. The layout is easy to follow.',
        rating: 0,
    },
    {
        name: 'Josephine Wairimu',
        role: 'Synthetic Indices Trader — Nyeri, Kenya',
        quote: 'Vola has a professional look and an interesting set of features. I\'m particularly interested in the strategy editor.',
        rating: 0,
    },
    {
        name: 'Sipho Dlamini',
        role: 'Rise/Fall Trader — Durban, South Africa',
        quote: 'A well-organized dashboard makes a difference. Vola puts the main trading tools where I would expect to find them.',
        rating: 0,
    },
    {
        name: 'Cynthia Atieno',
        role: 'Deriv Trader — Nairobi, Kenya',
        quote: 'If automated trading interests you, Vola is a platform worth exploring. The visual approach to strategies is appealing.',
        rating: 0,
    },
    {
        name: 'Musa Nkosi',
        role: 'Volatility Trader — Pretoria, South Africa',
        quote: 'What I like most is the idea of bringing bot creation, charts, and analysis into one convenient workspace.',
        rating: 0,
    },
    {
        name: 'Victor Wanyama',
        role: 'Synthetic Indices Trader — Mombasa, Kenya',
        quote: 'Vola has a clean design and a straightforward layout. It makes exploring the platform feel less overwhelming.',
        rating: 0,
    },
    {
        name: 'Esther Nambasa',
        role: 'Deriv Trader — Kampala, Uganda',
        quote: 'The strategy templates are an interesting starting point, especially when you want to explore different approaches before building your own.',
        rating: 0,
    },
    {
        name: 'Daniel Kiptoo',
        role: 'Rise/Fall Trader — Eldoret, Kenya',
        quote: 'I\'m interested in tools that help me organize my trading process. Vola\'s dashboard and bot-building concept caught my eye.',
        rating: 0,
    },
    {
        name: 'Rethabile Nkomo',
        role: 'Synthetic Indices Trader — Johannesburg, South Africa',
        quote: 'Vola is the place to explore trading tools, learn about automation, and build a workflow that suits your approach.',
        rating: 0,
    },
];

export type THighlight = {
    badge: string;
    title: string;
    subtitle: string;
    text: string;
    tone: 'teal' | 'violet' | 'sky' | 'emerald';
};

export const HIGHLIGHTS: THighlight[] = [
    {
        badge: 'AT',
        title: 'Auto Trader',
        subtitle: 'Trades on a condition',
        text: 'Name the trigger - five even digits in a row, Over above 60% - and it places and tracks the trade for you.',
        tone: 'teal',
    },
    {
        badge: 'SC',
        title: 'Signal Scanner',
        subtitle: 'Analysis, not promises',
        text: 'Reads a market for Even/Odd, Over/Under, Matches/Differs or Rise/Fall and reports what actually happened.',
        tone: 'violet',
    },
    {
        badge: 'AI',
        title: 'AI Entry Scanner',
        subtitle: 'Finds the strongest market',
        text: 'Sweeps every open market, ranks them by the edge it can measure, and hands the winner to the bot builder.',
        tone: 'sky',
    },
    {
        badge: 'CT',
        title: 'Copy Trading',
        subtitle: 'Demo to real, or to clients',
        text: 'Mirror your demo trades onto your real account, or send the same trade to client accounts in one request.',
        tone: 'emerald',
    },
    {
        badge: 'FB',
        title: 'Free Bots',
        subtitle: 'Strategies ready to load',
        text: 'A library of bots you can filter by trade type, open in the editor and adjust until the rules suit you.',
        tone: 'violet',
    },
    {
        badge: 'AN',
        title: 'Analysis Tool',
        subtitle: 'Digit circles and streaks',
        text: 'Watch each digit fill up live, with the current run, the tick history and Over/Under split as they change.',
        tone: 'teal',
    },
];

export const FEATURES = [
    {
        icon: 'bot',
        title: 'Automation without code',
        subtitle: 'Your plan, on repeat',
        text: 'Drag blocks together, load a free bot or give the Auto Trader a condition. Nothing here needs programming.',
        tone: 'sky',
    },
    {
        icon: 'chart',
        title: 'Numbers you can check',
        subtitle: 'Counted, not guessed',
        text: 'Every percentage comes from live Deriv ticks, over a tick count you choose, so you can see how it was measured.',
        tone: 'emerald',
    },
    {
        icon: 'users',
        title: 'Copy trading built in',
        subtitle: 'One trade, many accounts',
        text: 'Practise on demo while your real account follows along, or place a trade across client accounts at once.',
        tone: 'violet',
    },
    {
        icon: 'shield',
        title: 'Limits you set first',
        subtitle: 'Decide before you start',
        text: 'Stake, martingale step, stop loss and take profit are part of every run, so a bad streak has a floor.',
        tone: 'sky',
    },
] as const;

export const WHY_CHOOSE = [
    'You log in through Deriv itself - your password never passes through us',
    'Free Deriv demo account, so every tool can be tested with virtual funds',
    'Prices, digits and results come straight from the Deriv API, live',
    'Analysis, scanner, free bots and automation in a single workspace',
    'Synthetic markets that keep trading at weekends and through the night',
    'A person to talk to on Telegram when something needs explaining',
];

export type TStep = { badge: string; title: string; text: string };

/** Three-step onboarding shown under the features panel. */
export const HOW_IT_WORKS: TStep[] = [
    {
        badge: '1',
        title: 'Log in with Deriv',
        text: `Open the official Deriv login from the button above. ${APP} receives a session, never your password.`,
    },
    {
        badge: '2',
        title: 'Analyse, then choose a bot',
        text: 'Check the digits or run the scanner, then load a free bot or set an Auto Trader rule that matches what you saw.',
    },
    {
        badge: '3',
        title: 'Test on demo, then decide',
        text: 'Run it on your demo account first. When the result convinces you, switch the account to real and set your limits.',
    },
];

export type TFaq = { q: string; a: string };

export const FAQ: TFaq[] = [
    {
        q: `Do I need a Deriv account to use ${APP}?`,
        a: 'Yes. The tools read live prices and place trades on your own Deriv account, so you log in with Deriv. Opening an account is free, and the demo account comes with virtual funds.',
    },
    {
        q: 'Is my Deriv password safe?',
        a: 'You type it on Deriv\'s own login page, never here. Deriv sends back a session for your account only, and you can end it any time from your Deriv settings.',
    },
    {
        q: 'Can I try everything without spending money?',
        a: 'Yes. Switch the account selector to Demo and the scanner, analysis tool, bots and auto trader all run on virtual funds.',
    },
    {
        q: 'Do I need to know how to code?',
        a: 'No. The free bots load with one click, the Auto Trader takes plain conditions, and the bot builder works by joining blocks together.',
    },
    {
        q: 'Which markets can I trade?',
        a: 'Whatever your Deriv account offers, including the synthetic indices that trade around the clock. The market list comes from Deriv, so it is always current.',
    },
    {
        q: 'Will a bot make me money?',
        a: 'No tool can promise that, and nothing here does. Bots remove the clicking and the hesitation; the risk stays yours, which is why limits and demo testing matter.',
    },
];
