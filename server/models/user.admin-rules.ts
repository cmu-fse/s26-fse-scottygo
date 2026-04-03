// R1 At-Least-One-Administrator Rule enforcement
// Extracted from user.model.ts to reduce coupling and eliminate duplication (Sigrid Item #7)

import DAC from '../db/dac';
import { IAppError } from '../../common/server.responses';

/**
 * R1 At-Least-One-Administrator Rule: Ensures the operation would not
 * leave zero active administrators.
 * @param username - The user being modified
 * @param action - 'inactivate' (status change) or 'demote' (privilege change)
 */
export async function ensureNotLastAdmin(
  username: string,
  action: 'inactivate' | 'demote'
): Promise<void> {
  const userAccount = await DAC.db.findUserAccountByUsername(
    username.toLowerCase()
  );
  if (!userAccount || userAccount.privilegeLevel !== 'Administrator') return;

  // For demotions, only guard if the admin is currently active
  if (action === 'demote' && userAccount.status !== 'Active') return;

  const adminCount = await DAC.db.countAdministrators();
  if (adminCount <= 1) {
    const error: IAppError = {
      type: 'ClientError',
      name: 'LastAdministrator',
      message:
        action === 'inactivate'
          ? 'Cannot inactivate the last Administrator'
          : 'Cannot demote the last active Administrator'
    };
    throw error;
  }
}

/**
 * Check if a user is the last active administrator.
 */
export async function isLastAdministrator(
  username: string
): Promise<boolean> {
  const userAccount = await DAC.db.findUserAccountByUsername(
    username.toLowerCase()
  );
  if (userAccount?.privilegeLevel !== 'Administrator') {
    return false;
  }
  const adminCount = await DAC.db.countAdministrators();
  return adminCount <= 1;
}
