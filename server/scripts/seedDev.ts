// Development-only sample data. This script is NEVER run automatically -
// not by `npm run dev`, not by `npm start`, not on production startup. It
// only runs when a developer explicitly types `npm run seed:dev`.
//
// It refuses to run at all if NODE_ENV=production, as a second line of
// defense against ever accidentally seeding fake business data into a real
// deployment.
import 'dotenv/config';
import crypto from 'crypto';
import { connectMongo } from '../mongo';
import { hashPassword } from '../auth';
import { addAuditLog } from '../db';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { RatingModel } from '../models/Rating';
import { SuspensionModel } from '../models/Suspension';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:dev refuses to run with NODE_ENV=production.');
  }

  await connectMongo();

  const existingDemoCustomer = await UserModel.findOne({ email: 'customer@gmail.com' });
  if (existingDemoCustomer) {
    console.log('Dev sample data already present (customer@gmail.com exists) - nothing to do. Delete it from MongoDB first if you want to reseed.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  const custId = 'user_cust_001';
  await UserModel.create({
    id: custId,
    email: 'customer@gmail.com',
    passwordHash: hashPassword('customer123'),
    role: 'customer',
    authProviders: ['local'],
    emailVerified: true,
    favourites: ['w_madurai_elec_1', 'w_chennai_plumb_1'],
    status: 'active',
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  console.log('Created dev customer: customer@gmail.com / customer123');

  const sampleWorkers = [
    {
      id: 'w_madurai_elec_1',
      name: 'R. Murugesan (ஆர். முருகேசன்)',
      email: 'murugan.electricals@gmail.com',
      phone: '9842145670',
      category: 'electrician',
      district: 'madurai',
      publicArea: 'Anna Nagar, Madurai',
      coordinates: { lat: 9.919, lng: 78.14 },
      serviceAreas: ['Anna Nagar', 'KK Nagar', 'Mattuthavani', 'Goripalayam', 'Teppakulam'],
      experience: 12,
      rate: '₹350 / visit',
      description: 'Expert residential and commercial electrician. Wiring, DB box, inverter setup, three-phase line troubleshooting, and fan/motor repairs.',
      profilePhoto: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 5, 5, 4, 5, 5, 4],
    },
    {
      id: 'w_chennai_plumb_1',
      name: 'S. Karthik (எஸ். கார்த்திக்)',
      email: 'karthik.plumbing.chn@gmail.com',
      phone: '9791084321',
      category: 'plumber',
      district: 'chennai',
      publicArea: 'T. Nagar, Chennai',
      coordinates: { lat: 13.0418, lng: 80.2341 },
      serviceAreas: ['T. Nagar', 'Mylapore', 'West Mambalam', 'Nungambakkam', 'Kodambakkam'],
      experience: 8,
      rate: '₹400 / service',
      description: 'Certified plumber specializing in leak repairs, bathroom fittings, motor installation, water tank cleaning, and CPVC piping.',
      profilePhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 5, 4, 5, 4],
    },
    {
      id: 'w_cbe_carp_1',
      name: 'M. Velusamy (எம். வேலுச்சாமி)',
      email: 'velu.woodworks@gmail.com',
      phone: '9443211234',
      category: 'carpenter',
      district: 'coimbatore',
      publicArea: 'RS Puram, Coimbatore',
      coordinates: { lat: 11.0118, lng: 76.9452 },
      serviceAreas: ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony'],
      experience: 16,
      rate: '₹600 / day',
      description: 'Master carpenter for customized wardrobes, modular kitchen woodwork, wooden door fixing, lock replacement, and antique furniture restoration.',
      profilePhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 5, 5, 5, 4, 5],
    },
    {
      id: 'w_trichy_paint_1',
      name: 'A. Selvaraj (ஏ. செல்வராஜ்)',
      email: 'selva.paints.try@gmail.com',
      phone: '9843378901',
      category: 'painter',
      district: 'tiruchirappalli',
      publicArea: 'Thillai Nagar, Trichy',
      coordinates: { lat: 10.828, lng: 78.685 },
      serviceAreas: ['Thillai Nagar', 'Cantonment', 'Srirangam', 'KK Nagar'],
      experience: 10,
      rate: '₹12 / sq.ft',
      description: 'Interior and exterior wall painting, waterproof primer coating, texture finish, and enamel polish for gates and grills.',
      profilePhoto: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 4, 5, 4, 5],
    },
    {
      id: 'w_madurai_ac_1',
      name: 'J. Praveen Kumar (ஜே. பிரவீன் குமார்)',
      email: 'praveen.cooling@gmail.com',
      phone: '9655234567',
      category: 'ac_appliance',
      district: 'madurai',
      publicArea: 'KK Nagar, Madurai',
      coordinates: { lat: 9.931, lng: 78.152 },
      serviceAreas: ['KK Nagar', 'Anna Nagar', 'Koodal Nagar', 'Othakadai', 'Melur'],
      experience: 7,
      rate: '₹450 / general service',
      description: 'Inverter AC specialist, jet pump wash cleaning, gas charging, PCB board repairs, and refrigerator/washing machine troubleshooting.',
      profilePhoto: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 5, 4, 5, 5, 5],
    },
    {
      id: 'w_salem_mason_1',
      name: 'K. Palanisamy (கே. பழனிசாமி)',
      email: 'palanisamy.mason@gmail.com',
      phone: '9443198765',
      category: 'mason',
      district: 'salem',
      publicArea: 'Fairlands, Salem',
      coordinates: { lat: 11.678, lng: 78.139 },
      serviceAreas: ['Fairlands', 'Suramangalam', 'Hasthampatti', 'Gugai'],
      experience: 20,
      rate: '₹800 / day',
      description: 'Experienced civil construction mason. Tile laying, plastering, wall alterations, concrete repair, and compound wall building.',
      profilePhoto: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=400',
      availability: 'Offline',
      verificationStatus: 'verified',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 5, 4, 4],
    },
    // Pending Verification Worker (demonstrates Section 18: Pending worker profiles remain publicly visible, shows 'Verification Pending', can be contacted & rated)
    {
      id: 'w_cbe_mechanic_pending',
      name: 'D. Vignesh (டி. விக்னேஷ்)',
      email: 'vignesh.garage@gmail.com',
      phone: '9842512399',
      category: 'mechanic',
      district: 'coimbatore',
      publicArea: 'Singanallur, Coimbatore',
      coordinates: { lat: 11.002, lng: 77.012 },
      serviceAreas: ['Singanallur', 'Ramanathapuram', 'Ondipudur', 'Irugur'],
      experience: 5,
      rate: '₹300 / service',
      description: 'Two wheeler doorstep breakdown assistance, oil service, brake tuning, carburetor cleaning, and battery replacement.',
      profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'pending',
      isSuspended: false,
      warningCount: 0,
      ratings: [5, 4],
    },
    // Suspended Worker (demonstrates Section 30: Suspended worker card at bottom, red badge, phone hidden, call/whatsapp disabled, new ratings disabled, has suspension info)
    {
      id: 'w_chn_cleaning_suspended',
      name: 'T. Arumugam (டி. ஆறுமுகம்)',
      email: 'arumugam.clean@gmail.com',
      phone: '9840199887',
      category: 'cleaning',
      district: 'chennai',
      publicArea: 'Velachery, Chennai',
      coordinates: { lat: 12.9815, lng: 80.218 },
      serviceAreas: ['Velachery', 'Guindy', 'Tambaram', 'Adyar'],
      experience: 4,
      rate: '₹800 / day',
      description: 'Deep house cleaning, floor scrubbing, bathroom descaling, and water sump cleaning.',
      profilePhoto: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=400',
      availability: 'Available',
      verificationStatus: 'verified',
      isSuspended: true,
      warningCount: 1,
      ratings: [3, 2, 4],
      suspensionData: {
        reason: 'Reported misconduct',
        note: 'Customer reported unprofessional behavior and delayed arrival without notification.',
        durationDays: 7,
      },
    },
  ];

  for (const w of sampleWorkers as any[]) {
    const userId = `user_${w.id}`;
    const workerNow = new Date().toISOString();

    await UserModel.create({
      id: userId,
      email: w.email,
      passwordHash: hashPassword('worker123'),
      role: 'worker',
      authProviders: ['local'],
      emailVerified: true,
      favourites: [],
      status: 'active',
      tokenVersion: 1,
      workerId: w.id,
      createdAt: workerNow,
      updatedAt: workerNow,
    });

    const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    for (const r of w.ratings as number[]) {
      breakdown[r] = (breakdown[r] || 0) + 1;
      sum += r;
      await RatingModel.create({
        id: crypto.randomUUID(),
        customerId: custId,
        workerId: w.id,
        rating: r,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const averageRating = w.ratings.length ? Number((sum / w.ratings.length).toFixed(1)) : 0;

    let suspensionInfo: any = null;
    if (w.isSuspended && w.suspensionData) {
      const suspId = crypto.randomUUID();
      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + 6 * 86400000).toISOString(); // 6 days remaining
      suspensionInfo = {
        id: suspId,
        reason: w.suspensionData.reason,
        note: w.suspensionData.note,
        startDate,
        endDate,
        durationDays: 7,
        remainingDays: 6,
        status: 'active',
        actionBy: 'Namma Ooru Workers Admin',
      };
      await SuspensionModel.create({
        ...suspensionInfo,
        workerId: w.id,
        workerName: w.name,
        createdBy: 'admin@nammaooruworkers.com',
        resolvedBy: null,
        resolutionNote: null,
        createdAt: startDate,
        updatedAt: startDate,
      });
    }

    await WorkerModel.create({
      id: w.id,
      userId,
      name: w.name,
      email: w.email,
      phone: w.phone,
      category: w.category,
      description: w.description,
      experience: w.experience,
      rate: w.rate,
      profilePhoto: w.profilePhoto,
      district: w.district,
      publicArea: w.publicArea,
      coordinates: w.coordinates,
      serviceAreas: w.serviceAreas,
      availability: w.availability,
      verificationStatus: w.verificationStatus,
      isSuspended: w.isSuspended,
      suspensionInfo,
      warningCount: w.warningCount,
      ratingSummary: { averageRating, totalRatings: w.ratings.length, breakdown },
      createdAt: workerNow,
      updatedAt: workerNow,
    });

    console.log(`Created dev worker: ${w.email} / worker123 (${w.name})`);
  }

  await addAuditLog('System Bootstrap', 'seed_dev_data', 'system', 'all', null, { seededWorkersCount: sampleWorkers.length });

  console.log(`\nDone - seeded 1 demo customer and ${sampleWorkers.length} demo workers.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('seed:dev failed:', err);
  process.exit(1);
});
