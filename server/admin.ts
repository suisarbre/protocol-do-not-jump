import {csvEnv} from './env';
import type {Session} from './types';

export function isAdmin(session: Session): boolean {
  const admins = csvEnv('ADMIN_GITHUB_USERS');
  return admins.length > 0 && admins.includes(session.user.login);
}
