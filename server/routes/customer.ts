import express, { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../auth';
import { contactLimiter } from '../middleware/rateLimit';
import { WorkerModel } from '../models/Worker';
import { UserModel } from '../models/User';
import { ContactHistoryModel } from '../models/ContactHistory';

const router = express.Router();

// 1. Record Contact (Call or WhatsApp) and return sanitized direct action URL
router.post('/contact', contactLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { workerId, method } = req.body;
    const user = req.user; // optional: can be guest

    if (!workerId || (method !== 'Call' && method !== 'WhatsApp')) {
      return res.status(400).json({ error: 'Worker ID and method (Call or WhatsApp) are required' });
    }

    const worker = await WorkerModel.findOne({ id: workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Suspended worker contact is disabled (Req 27 & 30)
    if (worker.isSuspended) {
      return res.status(403).json({ error: 'Contacting suspended workers is disabled' });
    }

    // If authenticated customer, record in contact history (Req 10)
    if (user && user.userId) {
      await ContactHistoryModel.create({
        id: crypto.randomUUID(),
        customerId: user.userId,
        workerId: worker.id,
        method,
        timestamp: new Date().toISOString(),
      });
    }

    // Generate a safe direct action URL - the raw phone number is used
    // server-side only, to build tel:/wa.me links; it is never sent back
    // to the client as a bare field.
    const cleanPhone = (worker.phone || '').replace(/[^0-9]/g, '');
    const finalPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    let actionUrl = '';
    if (method === 'Call') {
      actionUrl = `tel:+${finalPhone}`;
    } else {
      const message = encodeURIComponent(
        `Hello ${worker.name}, I found your profile on Namma Ooru Workers and would like to inquire about your ${worker.category} service.`
      );
      actionUrl = `https://wa.me/${finalPhone}?text=${message}`;
    }

    res.json({ success: true, method, actionUrl });
  } catch (err) {
    console.error('contact error:', err);
    res.status(500).json({ error: 'Could not process contact request.' });
  }
});

// 2. Customer Contacted History (Req 10)
router.get('/contact/history', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.json([]);
    }

    const history = await ContactHistoryModel.find({ customerId: user.userId }).sort({ timestamp: -1 }).limit(200);

    const populated = await Promise.all(
      history.map(async (c: any) => {
        const worker = await WorkerModel.findOne({ id: c.workerId });
        return {
          id: c.id,
          workerId: c.workerId,
          workerName: worker?.name || 'Worker',
          workerCategory: worker?.category || 'Service',
          workerArea: worker?.publicArea || '',
          profilePhoto: worker?.profilePhoto || null,
          availability: worker?.availability || 'Offline',
          isSuspended: worker?.isSuspended || false,
          method: c.method,
          timestamp: c.timestamp,
        };
      })
    );

    res.json(populated);
  } catch (err) {
    console.error('contact history error:', err);
    res.status(500).json({ error: 'Could not load contact history.' });
  }
});

// 3. Customer Favourites (Req 11)
router.get('/favourites', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.json([]);
    }

    const dbUser = await UserModel.findOne({ id: user.userId });
    if (!dbUser || !dbUser.favourites || dbUser.favourites.length === 0) {
      return res.json([]);
    }

    const workers = await WorkerModel.find({ id: { $in: dbUser.favourites }, verificationStatus: { $ne: 'rejected' } });
    const favWorkers = workers.map((w: any) => ({
      id: w.id,
      name: w.name,
      category: w.category,
      district: w.district,
      publicArea: w.publicArea,
      serviceAreas: w.serviceAreas,
      experience: w.experience,
      rate: w.rate,
      profilePhoto: w.profilePhoto,
      availability: w.availability,
      verificationStatus: w.verificationStatus,
      isSuspended: w.isSuspended,
      ratingSummary: w.ratingSummary,
      canContact: !w.isSuspended,
    }));

    res.json(favWorkers);
  } catch (err) {
    console.error('favourites error:', err);
    res.status(500).json({ error: 'Could not load favourites.' });
  }
});

// 4. Toggle Favourite (Add or Remove)
router.post('/favourites/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { workerId } = req.body;

    if (!user) {
      return res.status(401).json({ error: 'Please sign in to save favourites to your account' });
    }

    const dbUser = await UserModel.findOne({ id: user.userId });
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    dbUser.favourites = dbUser.favourites || [];
    const index = dbUser.favourites.indexOf(workerId);
    let isSaved = false;

    if (index !== -1) {
      dbUser.favourites.splice(index, 1);
      isSaved = false;
    } else {
      dbUser.favourites.push(workerId);
      isSaved = true;
    }

    dbUser.updatedAt = new Date().toISOString();
    await dbUser.save();

    res.json({ success: true, isSaved, favourites: dbUser.favourites });
  } catch (err) {
    console.error('favourites toggle error:', err);
    res.status(500).json({ error: 'Could not update favourites.' });
  }
});

// 5. Sync Guest Favourites into Account (Req 11)
router.post('/favourites/sync', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { guestFavourites } = req.body;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!Array.isArray(guestFavourites) || guestFavourites.length === 0) {
      return res.json({ success: true });
    }

    const dbUser = await UserModel.findOne({ id: user.userId });
    if (dbUser) {
      dbUser.favourites = Array.from(new Set([...(dbUser.favourites || []), ...guestFavourites]));
      dbUser.updatedAt = new Date().toISOString();
      await dbUser.save();
    }

    res.json({ success: true, favourites: dbUser?.favourites || [] });
  } catch (err) {
    console.error('favourites sync error:', err);
    res.status(500).json({ error: 'Could not sync favourites.' });
  }
});

export default router;
