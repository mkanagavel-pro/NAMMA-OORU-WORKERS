import express, { Response } from 'express';
import { AuthRequest, requireAuth } from '../auth';
import { NotificationModel } from '../models/Notification';

const router = express.Router();

// All notification endpoints require an authenticated account. There is no
// legitimate "guest" notification feed, and - critically - the simulated
// email inbox below carries OTP codes, so it must never be reachable
// without auth.
router.use(requireAuth);

function ownIdentifiers(user: NonNullable<AuthRequest['user']>): string[] {
  const ids = [user.userId, user.email];
  if (user.workerId) ids.push(user.workerId);
  if (user.role === 'admin') ids.push('admin');
  return ids;
}

// 1. Get Notifications for current user
// SECURITY: `recipientId` is only honoured for admins (who legitimately
// need to inspect a specific worker's or the platform's feed) - every
// other caller is strictly scoped to their own identifiers, preventing one
// account from reading another's notifications (IDOR).
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { recipientId, includeEmails } = req.query;

    let targetIds = ownIdentifiers(user);
    if (user.role === 'admin' && recipientId && typeof recipientId === 'string') {
      targetIds = [recipientId];
    }

    const query: Record<string, unknown> = { recipientId: { $in: targetIds } };
    if (includeEmails !== 'true') {
      query.isEmail = { $ne: true };
    }

    const list = await NotificationModel.find(query).sort({ createdAt: -1 }).limit(50);
    res.json(list);
  } catch (err) {
    console.error('notifications list error:', err);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

// 2. Get Simulated System Emails (dev/test inspector for transactional
// emails - this project does not yet send real email; see server/db.ts
// sendNotification()). SECURITY: strictly scoped to the caller's own
// identity, admin excepted, and requires auth (enforced above) - an
// unauthenticated or cross-account request here would otherwise leak OTP
// codes belonging to other users.
router.get('/emails', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const query: Record<string, unknown> = { isEmail: true };
    if (user.role !== 'admin') {
      query.recipientId = { $in: ownIdentifiers(user) };
    }

    const emails = await NotificationModel.find(query).sort({ createdAt: -1 }).limit(50);
    res.json(emails);
  } catch (err) {
    console.error('notification emails error:', err);
    res.status(500).json({ error: 'Could not load emails.' });
  }
});

// 3. Mark Notification as Read
// SECURITY: ownership check - previously any caller could mark any other
// user's notification as read by guessing/iterating IDs.
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const notif = await NotificationModel.findOne({ id });

    if (!notif) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (user.role !== 'admin' && !ownIdentifiers(user).includes(notif.recipientId)) {
      return res.status(403).json({ error: 'You do not have access to this notification' });
    }

    notif.read = true;
    await notif.save();
    res.json({ success: true });
  } catch (err) {
    console.error('mark notification read error:', err);
    res.status(500).json({ error: 'Could not update notification.' });
  }
});

// 4. Mark All as Read
router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    await NotificationModel.updateMany({ recipientId: { $in: ownIdentifiers(user) } }, { read: true });
    res.json({ success: true });
  } catch (err) {
    console.error('mark all notifications read error:', err);
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

export default router;
