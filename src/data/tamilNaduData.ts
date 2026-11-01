export interface DistrictInfo {
  id: string;
  nameEn: string;
  nameTa: string;
  lat: number;
  lng: number;
  towns: string[];
}

export interface WorkerCategoryInfo {
  id: string;
  nameEn: string;
  nameTa: string;
  iconName: string;
  popular: boolean;
}

export const WORKER_CATEGORIES: WorkerCategoryInfo[] = [
  { id: 'electrician', nameEn: 'Electrician', nameTa: 'மின் பணியாளர் / எலக்ட்ரீஷியன்', iconName: 'Zap', popular: true },
  { id: 'plumber', nameEn: 'Plumber', nameTa: 'குழாய் பணியாளர் / பிளம்பர்', iconName: 'Wrench', popular: true },
  { id: 'carpenter', nameEn: 'Carpenter', nameTa: 'தச்சர் / கார்பென்டர்', iconName: 'Hammer', popular: true },
  { id: 'painter', nameEn: 'Painter', nameTa: 'வர்ணம் பூசுபவர் / பெயிண்டர்', iconName: 'Paintbrush', popular: true },
  { id: 'mason', nameEn: 'Mason / Builder', nameTa: 'கொத்தனார் / மேஸ்திரி', iconName: 'HardHat', popular: true },
  { id: 'ac_appliance', nameEn: 'AC & Appliance Tech', nameTa: 'ஏசி / வீட்டு உபகரண பழுது', iconName: 'Tv', popular: true },
  { id: 'mechanic', nameEn: 'Two / Four Wheeler Mechanic', nameTa: 'வாகன மெக்கானிக்', iconName: 'Car', popular: true },
  { id: 'welder', nameEn: 'Welder & Fabrication', nameTa: 'வெல்டர் / ஃபேப்ரிகேஷன்', iconName: 'Flame', popular: false },
  { id: 'cleaning', nameEn: 'House Cleaning & Maid', nameTa: 'வீட்டு பராமரிப்பு / கிளீனிங்', iconName: 'Sparkles', popular: true },
  { id: 'gardener', nameEn: 'Gardener & Landscaper', nameTa: 'தோட்டக்காரர்', iconName: 'Trees', popular: false },
  { id: 'driver', nameEn: 'Driver (Personal / Commercial)', nameTa: 'ஓட்டுநர் / டிரைவர்', iconName: 'Navigation', popular: false },
  { id: 'cctv_tech', nameEn: 'CCTV & Security Tech', nameTa: 'சிசிடிவி தொழில்நுட்ப வல்லுநர்', iconName: 'Shield', popular: false },
  { id: 'tailor', nameEn: 'Tailor & Stitching', nameTa: 'தையல் கலைஞர்', iconName: 'Scissors', popular: false },
  { id: 'pest_control', nameEn: 'Pest Control', nameTa: 'பூச்சி கட்டுப்பாடு', iconName: 'Bug', popular: false },
  // ---- added later (the 14 above are unchanged) ----
  { id: 'mobile_repair', nameEn: 'Mobile Phone Repair', nameTa: 'மொபைல் போன் பழுது', iconName: 'Smartphone', popular: false },
  { id: 'computer_repair', nameEn: 'Computer / Laptop Repair', nameTa: 'கணினி / லேப்டாப் பழுது', iconName: 'Laptop', popular: false },
  { id: 'washing_machine', nameEn: 'Washing Machine Repair', nameTa: 'வாஷிங் மெஷின் பழுது', iconName: 'WashingMachine', popular: false },
  { id: 'refrigerator', nameEn: 'Refrigerator Repair', nameTa: 'குளிர்சாதனப் பெட்டி பழுது', iconName: 'Refrigerator', popular: false },
  { id: 'ro_purifier', nameEn: 'RO Water Purifier Service', nameTa: 'ஆர்.ஓ. குடிநீர் சுத்திகரிப்பான் சேவை', iconName: 'Droplets', popular: false },
  { id: 'solar', nameEn: 'Solar Panel Installation', nameTa: 'சோலார் பேனல் பொருத்துதல்', iconName: 'Sun', popular: false },
  { id: 'tile_flooring', nameEn: 'Tile / Flooring Worker', nameTa: 'டைல்ஸ் / தரை அமைப்பு பணியாளர்', iconName: 'LayoutGrid', popular: false },
  { id: 'plastering', nameEn: 'Plastering Worker', nameTa: 'சுவர் பூச்சு பணியாளர்', iconName: 'PaintRoller', popular: false },
  { id: 'borewell_pump', nameEn: 'Borewell / Water Pump Technician', nameTa: 'ஆழ்துளை கிணறு / நீர் பம்ப் தொழில்நுட்பர்', iconName: 'Waves', popular: false },
  { id: 'packers_movers', nameEn: 'House Shifting / Packers', nameTa: 'வீடு மாற்றம் / பேக்கர்ஸ்', iconName: 'Truck', popular: false },
  { id: 'cook', nameEn: 'Cook / Home Cook', nameTa: 'சமையல்காரர் / வீட்டு சமையல்', iconName: 'ChefHat', popular: false },
  { id: 'laundry', nameEn: 'Laundry / Ironing Service', nameTa: 'சலவை / அயர்னிங் சேவை', iconName: 'Shirt', popular: false },
  { id: 'beautician', nameEn: 'Beautician', nameTa: 'அழகுக்கலை நிபுணர்', iconName: 'Sparkle', popular: false },
  { id: 'photographer', nameEn: 'Photographer / Videographer', nameTa: 'புகைப்படக் கலைஞர் / வீடியோகிராபர்', iconName: 'Camera', popular: false },
  { id: 'tuition_teacher', nameEn: 'Tuition Teacher', nameTa: 'டியூஷன் ஆசிரியர்', iconName: 'GraduationCap', popular: false },
  { id: 'purohit', nameEn: 'Purohitar / Ayyar (Pooja Services)', nameTa: 'புரோகிதர் / ஐயர் (பூஜை சேவைகள்)', iconName: 'Flower2', popular: false },
];

/** Category ids always shown as pills in the customer category bar (after "All Workers"), in this order. */
export const QUICK_CATEGORY_IDS = ['electrician', 'plumber', 'mason', 'carpenter'] as const;

/** Quick-access categories, in display order. */
export function getQuickCategories(): WorkerCategoryInfo[] {
  return QUICK_CATEGORY_IDS.map((id) => WORKER_CATEGORIES.find((c) => c.id === id)!).filter(Boolean);
}

/** Every category that is NOT a quick-access pill (shown in the searchable "More Categories" popup). */
export function getMoreCategories(): WorkerCategoryInfo[] {
  const quick = new Set<string>(QUICK_CATEGORY_IDS);
  return WORKER_CATEGORIES.filter((c) => !quick.has(c.id));
}

/** True only for ids defined in WORKER_CATEGORIES (used by backend validation). */
export function isValidCategoryId(v: unknown): v is string {
  return typeof v === 'string' && WORKER_CATEGORIES.some((c) => c.id === v);
}

/** Case-insensitive match on English OR Tamil name (and id). Empty query matches all. */
export function filterCategories(list: WorkerCategoryInfo[], query: string): WorkerCategoryInfo[] {
  const q = query.normalize('NFC').trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.nameEn.toLowerCase().includes(q) || c.nameTa.toLowerCase().includes(q) || c.id.replace(/_/g, ' ').includes(q));
}

export const TN_DISTRICTS: DistrictInfo[] = [
  {
    id: 'chennai',
    nameEn: 'Chennai',
    nameTa: 'சென்னை',
    lat: 13.0827,
    lng: 80.2707,
    towns: ['T. Nagar', 'Anna Nagar', 'Velachery', 'Tambaram', 'Adyar', 'Mylapore', 'Guindy', 'Ambattur', 'Porur', 'Perambur', 'Avadi'],
  },
  {
    id: 'coimbatore',
    nameEn: 'Coimbatore',
    nameTa: 'கோயம்புத்தூர்',
    lat: 11.0168,
    lng: 76.9558,
    towns: ['Gandhipuram', 'RS Puram', 'Peelamedu', 'Singanallur', 'Saravanampatti', 'Saibaba Colony', 'Kuniyamuthur', 'Pollachi'],
  },
  {
    id: 'madurai',
    nameEn: 'Madurai',
    nameTa: 'மதுரை',
    lat: 9.9252,
    lng: 78.1198,
    towns: ['Anna Nagar', 'KK Nagar', 'Sellur', 'Simmakkal', 'Thirunagar', 'Goripalayam', 'Mattuthavani', 'Othakadai', 'Usilampatti', 'Melur'],
  },
  {
    id: 'tiruchirappalli',
    nameEn: 'Tiruchirappalli',
    nameTa: 'திருச்சிராப்பள்ளி',
    lat: 10.7905,
    lng: 78.7047,
    towns: ['Thillai Nagar', 'Cantonment', 'Srirangam', 'KK Nagar', 'Ponmalai', 'Kattur', 'Lalgudi', 'Manapparai'],
  },
  {
    id: 'salem',
    nameEn: 'Salem',
    nameTa: 'சேலம்',
    lat: 11.6643,
    lng: 78.146,
    towns: ['Hasthampatti', 'Fairlands', 'Suramangalam', 'Ammapet', 'Gugai', 'Shevapet', 'Attur', 'Mettur'],
  },
  {
    id: 'tirunelveli',
    nameEn: 'Tirunelveli',
    nameTa: 'திருநெல்வேலி',
    lat: 8.7139,
    lng: 77.7567,
    towns: ['Palayamkottai', 'Town', 'Junction', 'Melapalayam', 'Pettai', 'Thachanallur', 'Ambasamudram'],
  },
  {
    id: 'tiruppur',
    nameEn: 'Tiruppur',
    nameTa: 'திருப்பூர்',
    lat: 11.1085,
    lng: 77.3411,
    towns: ['Avinashi Road', 'Kumaran Road', 'Palladam', 'Udumalaipettai', 'Kangeyam', 'Dharapuram'],
  },
  {
    id: 'erode',
    nameEn: 'Erode',
    nameTa: 'ஈரோடு',
    lat: 11.341,
    lng: 77.7172,
    towns: ['Brough Road', 'Perundurai', 'Bhavani', 'Gobichettipalayam', 'Sathyamangalam', 'Modakurichi'],
  },
  {
    id: 'vellore',
    nameEn: 'Vellore',
    nameTa: 'வேலூர்',
    lat: 12.9165,
    lng: 79.1325,
    towns: ['Katpadi', 'Sathuvachari', 'Bagayam', 'Gudiyatham', 'Anaicut'],
  },
  {
    id: 'thanjavur',
    nameEn: 'Thanjavur',
    nameTa: 'தஞ்சாவூர்',
    lat: 10.787,
    lng: 79.1378,
    towns: ['Medical College Road', 'Old Bus Stand', 'Kumbakonam', 'Pattukkottai', 'Papanasam'],
  },
  {
    id: 'dindigul',
    nameEn: 'Dindigul',
    nameTa: 'திண்டுக்கல்',
    lat: 10.3673,
    lng: 77.9803,
    towns: ['Palani Road', 'Begambur', 'Palani', 'Kodaikanal', 'Natham', 'Oddanchatram'],
  },
  {
    id: 'kanyakumari',
    nameEn: 'Kanyakumari',
    nameTa: 'கன்னியாகுமரி',
    lat: 8.0883,
    lng: 77.5385,
    towns: ['Nagercoil', 'Kanyakumari Town', 'Marthandam', 'Thuckalay', 'Colachel'],
  },
  {
    id: 'thoothukudi',
    nameEn: 'Thoothukudi',
    nameTa: 'தூத்துக்குடி',
    lat: 8.7642,
    lng: 78.1348,
    towns: ['Bryant Nagar', 'Millerpuram', 'Kovilpatti', 'Tiruchendur', 'Srivaikuntam'],
  },
  {
    id: 'cuddalore',
    nameEn: 'Cuddalore',
    nameTa: 'கடலூர்',
    lat: 11.748,
    lng: 79.7714,
    towns: ['Manjakuppam', 'Chidambaram', 'Panruti', 'Vridhachalam', 'Neyveli'],
  },
  {
    id: 'kanchipuram',
    nameEn: 'Kanchipuram',
    nameTa: 'காஞ்சிபுரம்',
    lat: 12.8342,
    lng: 79.7036,
    towns: ['Gandhi Road', 'Sriperumbudur', 'Walajabad', 'Uthiramerur'],
  },
  {
    id: 'tiruvallur',
    nameEn: 'Tiruvallur',
    nameTa: 'திருவள்ளூர்',
    lat: 13.1434,
    lng: 79.9079,
    towns: ['Tiruvallur Town', 'Poonamallee', 'Tiruttani', 'Gummidipoondi'],
  },
  {
    id: 'chengalpattu',
    nameEn: 'Chengalpattu',
    nameTa: 'செங்கல்பட்டு',
    lat: 12.6819,
    lng: 79.9888,
    towns: ['Chengalpattu Town', 'Mahabalipuram', 'Guduvanchery', 'Maraimalai Nagar', 'Maduranthakam'],
  },
  {
    id: 'dharmapuri',
    nameEn: 'Dharmapuri',
    nameTa: 'தருமபுரி',
    lat: 12.1211,
    lng: 78.1582,
    towns: ['Dharmapuri Town', 'Harur', 'Palacode', 'Pennagaram'],
  },
  {
    id: 'krishnagiri',
    nameEn: 'Krishnagiri',
    nameTa: 'கிருஷ்ணகிரி',
    lat: 12.5186,
    lng: 78.2137,
    towns: ['Hosur', 'Krishnagiri Town', 'Pochampalli', 'Bargur'],
  },
  {
    id: 'namakkal',
    nameEn: 'Namakkal',
    nameTa: 'நாமக்கல்',
    lat: 11.2189,
    lng: 78.1674,
    towns: ['Namakkal Town', 'Tiruchengode', 'Rasipuram', 'Paramathi Velur'],
  },
  {
    id: 'nilgiris',
    nameEn: 'Nilgiris',
    nameTa: 'நீலகிரி',
    lat: 11.4102,
    lng: 76.695,
    towns: ['Udhagamandalam (Ooty)', 'Coonoor', 'Kotagiri', 'Gudalur'],
  },
  {
    id: 'karur',
    nameEn: 'Karur',
    nameTa: 'கரூர்',
    lat: 10.9601,
    lng: 78.0766,
    towns: ['Karur Town', 'Kulithalai', 'Aravakurichi'],
  },
  {
    id: 'perambalur',
    nameEn: 'Perambalur',
    nameTa: 'பெரம்பலூர்',
    lat: 11.2342,
    lng: 78.8821,
    towns: ['Perambalur Town', 'Kunnam', 'Veppanthattai'],
  },
  {
    id: 'ariyalur',
    nameEn: 'Ariyalur',
    nameTa: 'அரியலூர்',
    lat: 11.1401,
    lng: 79.0786,
    towns: ['Ariyalur Town', 'Jayankondam', 'Sendurai'],
  },
  {
    id: 'nagapattinam',
    nameEn: 'Nagapattinam',
    nameTa: 'நாகப்பட்டினம்',
    lat: 10.7672,
    lng: 79.8424,
    towns: ['Nagapattinam Town', 'Velankanni', 'Vedaranyam'],
  },
  {
    id: 'mayiladuthurai',
    nameEn: 'Mayiladuthurai',
    nameTa: 'மயிலாடுதுறை',
    lat: 11.1075,
    lng: 79.6524,
    towns: ['Mayiladuthurai Town', 'Sirkazhi', 'Tharangambadi'],
  },
  {
    id: 'tiruvarur',
    nameEn: 'Tiruvarur',
    nameTa: 'திருவாரூர்',
    lat: 10.7725,
    lng: 79.6365,
    towns: ['Tiruvarur Town', 'Mannargudi', 'Thiruthuraipoondi'],
  },
  {
    id: 'pudukkottai',
    nameEn: 'Pudukkottai',
    nameTa: 'புதுக்கோட்டை',
    lat: 10.3833,
    lng: 78.8001,
    towns: ['Pudukkottai Town', 'Aranthangi', 'Alangudi', 'Illuppur'],
  },
  {
    id: 'sivaganga',
    nameEn: 'Sivaganga',
    nameTa: 'சிவகங்கை',
    lat: 9.8433,
    lng: 78.4809,
    towns: ['Karaikudi', 'Sivaganga Town', 'Devakottai', 'Manamadurai'],
  },
  {
    id: 'ramanathapuram',
    nameEn: 'Ramanathapuram',
    nameTa: 'ராமநாதபுரம்',
    lat: 9.3639,
    lng: 78.8395,
    towns: ['Ramanathapuram Town', 'Rameswaram', 'Paramakudi', 'Kilakarai'],
  },
  {
    id: 'virudhunagar',
    nameEn: 'Virudhunagar',
    nameTa: 'விருதுநகர்',
    lat: 9.568,
    lng: 77.9624,
    towns: ['Sivakasi', 'Virudhunagar Town', 'Rajapalayam', 'Srivilliputhur', 'Aruppukkottai'],
  },
  {
    id: 'tenkasi',
    nameEn: 'Tenkasi',
    nameTa: 'தென்காசி',
    lat: 8.9594,
    lng: 77.3161,
    towns: ['Tenkasi Town', 'Courtallam', 'Sankarankovil', 'Kadayanallur'],
  },
  {
    id: 'theni',
    nameEn: 'Theni',
    nameTa: 'தேனி',
    lat: 10.0104,
    lng: 77.4768,
    towns: ['Theni Town', 'Periyakulam', 'Bodinayakanur', 'Cumbum'],
  },
  {
    id: 'ranipet',
    nameEn: 'Ranipet',
    nameTa: 'ராணிப்பேட்டை',
    lat: 12.9229,
    lng: 79.3326,
    towns: ['Ranipet Town', 'Walaja', 'Arcot', 'Arakkonam'],
  },
  {
    id: 'tirupathur',
    nameEn: 'Tirupathur',
    nameTa: 'திருப்பத்தூர்',
    lat: 12.4952,
    lng: 78.5678,
    towns: ['Tirupathur Town', 'Ambur', 'Vaniyambadi', 'Natrampalli'],
  },
  {
    id: 'kallakurichi',
    nameEn: 'Kallakurichi',
    nameTa: 'கள்ளக்குறிச்சி',
    lat: 11.7384,
    lng: 78.9639,
    towns: ['Kallakurichi Town', 'Ulundurpet', 'Sankarapuram', 'Chinnasalem'],
  },
  {
    id: 'viluppuram',
    nameEn: 'Viluppuram',
    nameTa: 'விழுப்புரம்',
    lat: 11.9401,
    lng: 79.4861,
    towns: ['Viluppuram Town', 'Tindivanam', 'Gingee', 'Marakkanam'],
  },
  {
    id: 'tiruvannamalai',
    nameEn: 'Tiruvannamalai',
    nameTa: 'திருவண்ணாமலை',
    lat: 12.2253,
    lng: 79.0747,
    towns: ['Tiruvannamalai Town', 'Arani', 'Polur', 'Chengam', 'Cheyyar'],
  },
];
