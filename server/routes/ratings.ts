import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest, requireAuth } from '../auth';
import { ratingLimiter } from '../middleware/rateLimit';
import { RatingModel } from '../models/Rating';
import { WorkerModel } from '../models/Worker';

const router = express.Router();

async function recalculateWorkerRatings(workerId: string) {
  const worker = await WorkerModel.findOne({ id: workerId });
  if (!worker) return null;

  const ratings = await RatingModel.find({ workerId });
  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  ratings.forEach((r: any) => {
    const val = Math.max(1, Math.min(5, Math.round(r.rating)));
    breakdown[val] = (breakdown[val] || 0) + 1;
    sum += val;
  });

  const totalRatings = ratings.length;
  const averageRating = totalRatings > 0 ? Number((sum / totalRatings).toFixed(1)) : 0;

  worker.ratingSummary = { averageRating, totalRatings, breakdown } as any;
  worker.updatedAt = new Date().toISOString();
  await worker.save();
  return worker;
}

// 1. Submit or Update Rating (Req 12: logged-in only; 1 per customer/worker; anonymous to worker)
router.post('/', requireAuth, ratingLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    const { workerId, rating } = req.body;

    if (!workerId || rating === undefined) {
      return res.status(400).json({ error: 'Worker ID and rating are required' });
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    const worker = await WorkerModel.findOne({ id: workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    if (worker.isSuspended) {
      return res.status(403).json({ error: 'Ratings are temporarily disabled for suspended workers' });
    }
    if (userPayload.workerId && userPayload.workerId === workerId) {
      return res.status(400).json({ error: 'You cannot rate your own worker profile' });
    }

    const existing = await RatingModel.findOne({ customerId: userPayload.userId, workerId });
    const now = new Date().toISOString();
    let isUpdate = false;
    let finalRating: number;

    if (existing) {
      existing.rating = numRating;
      existing.updatedAt = now;
      await existing.save();
      isUpdate = true;
      finalRating = existing.rating;
    } else {
      // Unique index on (customerId, workerId) in the Rating model is the
      // backend-enforced guarantee behind "one rating per customer per
      // worker" - a race between two near-simultaneous requests from the
      // same customer would have one insert fail on that constraint rather
      // than silently create a duplicate.
      const created = await RatingModel.create({
        id: crypto.randomUUID(),
        customerId: userPayload.userId, // internal only, NEVER exposed to the worker
        workerId,
        rating: numRating,
        createdAt: now,
        updatedAt: now,
      });
      finalRating = created.rating;
    }

    const updatedWorker = await recalculateWorkerRatings(workerId);

    res.json({
      success: true,
      isUpdate,
      rating: finalRating,
      ratingSummary: updatedWorker?.ratingSummary,
      message: isUpdate ? 'Rating updated successfully!' : 'Thank you! Rating submitted successfully.',
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      // Unique index race - extremely rare, but handle it as an update-retry hint.
      return res.status(409).json({ error: 'Please try submitting your rating again.' });
    }
    console.error('rating submit error:', err);
    res.status(500).json({ error: 'Rating submission failed. Please try again.' });
  }
});

// 2. Get Worker Rating Breakdown (Public, strictly anonymous)
router.get('/worker/:workerId', async (req: Request, res: Response) => {
  try {
    const worker = await WorkerModel.findOne({ id: req.params.workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    const total = worker.ratingSummary?.totalRatings || 0;
    const breakdown: any = worker.ratingSummary?.breakdown || {};

    const percentages = {
      5: total > 0 ? Math.round(((breakdown[5] || 0) / total) * 100) : 0,
      4: total > 0 ? Math.round(((breakdown[4] || 0) / total) * 100) : 0,
      3: total > 0 ? Math.round(((breakdown[3] || 0) / total) * 100) : 0,
      2: total > 0 ? Math.round(((breakdown[2] || 0) / total) * 100) : 0,
      1: total > 0 ? Math.round(((breakdown[1] || 0) / total) * 100) : 0,
    };

    res.json({
      averageRating: worker.ratingSummary?.averageRating || 0,
      totalRatings: total,
      breakdown,
      percentages,
    });
  } catch (err) {
    console.error('rating breakdown error:', err);
    res.status(500).json({ error: 'Could not load rating breakdown.' });
  }
});

// 3. Customer's Own Ratings History
router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    const myRatings = await RatingModel.find({ customerId: userPayload.userId }).sort({ updatedAt: -1 });

    const populated = await Promise.all(
      myRatings.map(async (r: any) => {
        const worker = await WorkerModel.findOne({ id: r.workerId });
        return {
          id: r.id,
          workerId: r.workerId,
          workerName: worker?.name || 'Worker',
          workerCategory: worker?.category || 'Service',
          workerArea: worker?.publicArea || '',
          rating: r.rating,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
    );

    res.json(populated);
  } catch (err) {
    console.error('my ratings error:', err);
    res.status(500).json({ error: 'Could not load your ratings.' });
  }
});

export default router;
