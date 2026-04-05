import { auth } from '../../auth';

export type UserRole = 'member' | 'host' | 'admin';

export async function getServerSession() {
  return await auth();
}

export function getUserRole(session: any): UserRole {
  const role = session?.user?.role;
  if (role === 'admin') return 'admin';
  return 'host';
}

export function canCreateEvents(role: UserRole): boolean {
  return role === 'host' || role === 'admin';
}

export function canEditEvent(role: UserRole, isCreator: boolean): boolean {
  // Only the creator can edit — admins can delete but not edit others' events
  if (isCreator && (role === 'host' || role === 'admin')) return true;
  return false;
}

export function canDeleteEvent(role: UserRole, isCreator: boolean): boolean {
  if (role === 'admin') return true;
  if (role === 'host' && isCreator) return true;
  return false;
}

export function canEditAllEvents(role: UserRole): boolean {
  return role === 'admin';
}

export function isAuthenticated(session: any): boolean {
  return !!session?.user?.role;
}
