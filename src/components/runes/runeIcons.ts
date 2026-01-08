// Elder Futhark Runes for Liminal Calendar
// These are Unicode runes with semantic meanings

export const RUNES = {
  // ᛟ Othala - Home/Heritage - Community events
  othala: {
    char: 'ᛟ',
    name: 'Othala',
    meaning: 'Home/Heritage',
    usage: 'Community events',
  },
  // ᛊ Sowilo - Sun/Light - Golden Hours indicator
  sowilo: {
    char: 'ᛊ',
    name: 'Sowilo',
    meaning: 'Sun/Light',
    usage: 'Golden Hours',
  },
  // ᚱ Raido - Journey - External/synced events
  raido: {
    char: 'ᚱ',
    name: 'Raido',
    meaning: 'Journey',
    usage: 'Synced events',
  },
  // ᛞ Dagaz - Day/Dawn - Day markers
  dagaz: {
    char: 'ᛞ',
    name: 'Dagaz',
    meaning: 'Day/Dawn',
    usage: 'Day markers',
  },
  // ᚷ Gebo - Gift/Exchange - Collaborative events
  gebo: {
    char: 'ᚷ',
    name: 'Gebo',
    meaning: 'Gift/Exchange',
    usage: 'Collaborative',
  },
  // ᛇ Eihwaz - Threshold - Liminal transitions
  eihwaz: {
    char: 'ᛇ',
    name: 'Eihwaz',
    meaning: 'Threshold',
    usage: 'Transitions',
  },
} as const;

export type RuneKey = keyof typeof RUNES;

// Badge configurations for different event types
export const RUNE_BADGES = {
  community: {
    rune: RUNES.othala,
    label: 'Community',
    className: 'rune-badge-stone',
  },
  golden: {
    rune: RUNES.sowilo,
    label: 'Golden Hour',
    className: 'rune-badge-gold',
  },
  synced: {
    rune: RUNES.raido,
    label: 'Synced',
    className: 'rune-badge-synced',
  },
  collaborative: {
    rune: RUNES.gebo,
    label: 'Collaborative',
    className: 'rune-badge-stone',
  },
} as const;

export type BadgeType = keyof typeof RUNE_BADGES;
