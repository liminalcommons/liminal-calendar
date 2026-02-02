/**
 * Event Types Configuration for Liminal Calendar
 * Defines categories with colors and icons for event visualization
 */

import { EventType } from './supabase';

export interface EventTypeConfig {
  label: string;
  color: string; // Hex color for badges and calendar dots
  bgColor: string; // Tailwind bg class for cards
  textColor: string; // Tailwind text class
  borderColor: string; // Tailwind border class
  icon: string; // Icon name or emoji
  description: string;
}

export const EVENT_TYPES: Record<EventType, EventTypeConfig> = {
  general: {
    label: 'General',
    color: '#6366f1', // Indigo
    bgColor: 'bg-indigo-50 dark:bg-indigo-950',
    textColor: 'text-indigo-700 dark:text-indigo-300',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    icon: '📅',
    description: 'General community event',
  },
  presentation: {
    label: 'Presentation',
    color: '#f59e0b', // Amber
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: '🎤',
    description: 'Talk, demo, or presentation',
  },
  workshop: {
    label: 'Workshop',
    color: '#10b981', // Emerald
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    icon: '🛠️',
    description: 'Hands-on learning session',
  },
  social: {
    label: 'Social',
    color: '#ec4899', // Pink
    bgColor: 'bg-pink-50 dark:bg-pink-950',
    textColor: 'text-pink-700 dark:text-pink-300',
    borderColor: 'border-pink-200 dark:border-pink-800',
    icon: '🎉',
    description: 'Social gathering or hangout',
  },
  meeting: {
    label: 'Meeting',
    color: '#3b82f6', // Blue
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: '💼',
    description: 'Working meeting or sync',
  },
  standup: {
    label: 'Standup',
    color: '#8b5cf6', // Violet
    bgColor: 'bg-violet-50 dark:bg-violet-950',
    textColor: 'text-violet-700 dark:text-violet-300',
    borderColor: 'border-violet-200 dark:border-violet-800',
    icon: '☕',
    description: 'Quick check-in or standup',
  },
};

/**
 * Get event type options for select dropdowns
 */
export const EVENT_TYPE_OPTIONS: { value: EventType; label: string; icon: string }[] = Object.entries(
  EVENT_TYPES
).map(([value, config]) => ({
  value: value as EventType,
  label: config.label,
  icon: config.icon,
}));

/**
 * Get the configuration for a specific event type
 */
export function getEventTypeConfig(type: EventType | undefined | null): EventTypeConfig {
  return EVENT_TYPES[type || 'general'] || EVENT_TYPES.general;
}

/**
 * Get badge classes for an event type
 */
export function getEventTypeBadgeClasses(type: EventType | undefined | null): string {
  const config = getEventTypeConfig(type);
  return `${config.bgColor} ${config.textColor} ${config.borderColor}`;
}
